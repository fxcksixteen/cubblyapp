import { createContentClassifier, profileFor, type ScreenContentClass } from "./screenContentMode";

export interface AutomaticScreenEncoding {
  targetBitrate: number;
  targetFps: number;
  targetHeight: number;
  baseScale: number;
  voicePc?: RTCPeerConnection | null;
  getPeerCount?: () => number;
  /**
   * Initial degradation preference. From v0.4.28 the controller re-evaluates
   * this every tick from measured content (see lib/screenContentMode), so this
   * is only the starting point.
   */
  degradationPreference?: RTCDegradationPreference;
  /**
   * v0.4.28 — the shared video track, so the controller can re-apply
   * `contentHint` when the content class changes.
   */
  track?: MediaStreamTrack | null;
  /**
   * v0.4.28 — measured native capture rate, in frames/sec, or null when the
   * native path isn't in use (full-screen capture / getDisplayMedia). WGC only
   * emits on content change, so this is a direct content-activity measurement.
   */
  getNativeCaptureFps?: () => number | null;
}

export interface ScreenCongestionSample {
  bitrate: number;
  targetBitrate: number;
  floorBitrate: number;
  availableOutgoingBitrate: number;
  loss: number;
  rttMs: number;
  baselineRttMs: number;
  bandwidthLimited: boolean;
  cleanSamples: number;
}

export function nextScreenBitrate(sample: ScreenCongestionSample): { bitrate: number; cleanSamples: number; reason: string } {
  const rttBloat = sample.baselineRttMs > 0 && sample.rttMs > sample.baselineRttMs + 65;
  const pressure = sample.loss > 0.04 || sample.bandwidthLimited || rttBloat;
  const estimatedSafe = sample.availableOutgoingBitrate > 0
    ? Math.max(sample.floorBitrate, sample.availableOutgoingBitrate * 0.72)
    : sample.targetBitrate;
  if (pressure) {
    return {
      bitrate: Math.max(sample.floorBitrate, Math.min(sample.bitrate * 0.72, estimatedSafe)),
      cleanSamples: 0,
      reason: rttBloat ? "call-rtt" : sample.bandwidthLimited ? "bandwidth" : "loss",
    };
  }
  const clean = sample.loss < 0.015 && (sample.baselineRttMs === 0 || sample.rttMs <= sample.baselineRttMs + 25);
  const cleanSamples = clean ? sample.cleanSamples + 1 : 0;
  if (cleanSamples >= 4) {
    return {
      bitrate: Math.min(sample.targetBitrate, estimatedSafe, sample.bitrate * 1.08),
      cleanSamples: 0,
      reason: "probe",
    };
  }
  return { bitrate: sample.bitrate, cleanSamples, reason: "hold" };
}

/**
 * Fraction of the target the encoder opens at before ramping up.
 * v0.4.30 — 0.35 meant a 1080p60 pick looked like 720p for the first ~6 s of
 * every share. Open close to what the user asked for and reach it in ~4 s;
 * congestion handling still cuts instantly if the link can't take it.
 */
export const RAMP_START_FRACTION = 0.6;
/** Controller ticks (2s each) over which the ramp reaches the target. */
export const RAMP_STEPS = 3;
/** Per-tick multiplier while ramping. */
export const RAMP_STEP_FACTOR = 1.45;

export function calculatePerPeerScreenBudget(totalBitrate: number, peerCount: number) {
  return Math.max(500_000, Math.round(totalBitrate / Math.max(1, peerCount)));
}

/**
 * v0.4.22 — keep voice ahead of the screen encoder.
 *
 * When a share saturates the uplink, Chromium splits the estimate across all
 * senders on the connection. Marking the audio sender high-priority (and the
 * video sender low) makes the pacer service voice packets first, which is why
 * calls used to stutter the moment a game share started.
 */
export function prioritizeVoiceOverScreen(screenPc: RTCPeerConnection, voicePc?: RTCPeerConnection | null) {
  try {
    voicePc?.getSenders().forEach((sender) => {
      if (sender.track?.kind !== "audio") return;
      const params = sender.getParameters();
      params.encodings?.forEach((enc: any) => {
        enc.priority = "high";
        enc.networkPriority = "high";
      });
      void sender.setParameters(params).catch(() => {});
    });
    screenPc.getSenders().forEach((sender) => {
      const kind = sender.track?.kind;
      if (!kind) return;
      const params = sender.getParameters();
      if (!params.encodings?.length) return;
      params.encodings.forEach((enc: any) => {
        if (kind === "audio") {
          enc.priority = voicePc ? "medium" : "high";
          enc.networkPriority = voicePc ? "medium" : "high";
        } else {
          enc.priority = "low";
          enc.networkPriority = "low";
        }
      });
      void sender.setParameters(params).catch(() => {});
    });
  } catch {}
}

/**
 * v0.4.26 — hard ceilings for senders stuck on a SOFTWARE encoder.
 *
 * Measured in the wild (Valorant share, 2026-08-02 logs): Chromium picked
 * NVENC for ordinary windows but fell back to OpenH264 for the game window,
 * and OpenH264 at 1080p60 devoured the CPU the game was already fighting
 * for — unwatchable stream, choppy share audio, the sender lagging in their
 * own call. The adaptive controller alone reacts far too slowly (and never
 * touches fps) because it was tuned for a hardware encoder.
 *
 * The clamp lives HERE, inside applyEncoding, because the adaptive
 * controller re-applies parameters every 2 s — a one-shot setParameters from
 * the detector would be silently overwritten on the next tick.
 *
 * Sticky per share on purpose: un-clamping when hardware "comes back" can
 * flip the encoder again (parameter changes re-init it), and an oscillating
 * share is worse than a stable 720p30 one.
 */
export interface EncoderClamp {
  maxFramerate: number;
  minScale: number;
  maxBitrate: number;
  /** Preserved so the clamp doesn't stomp the content mode's preference. */
  degradationPreference?: RTCDegradationPreference;
}
const encoderClamps = new WeakMap<RTCRtpSender, EncoderClamp>();

export function setEncoderClamp(sender: RTCRtpSender, clamp: EncoderClamp) {
  encoderClamps.set(sender, clamp);
  // Push it immediately rather than waiting for the controller's next tick.
  // Degradation preference is deliberately omitted here — it belongs to the
  // share's content mode, and the controller re-applies it on its next tick.
  void applyEncoding(sender, clamp.maxBitrate, clamp.maxFramerate, clamp.minScale, clamp.degradationPreference).catch(() => {});
}

export function getEncoderClamp(sender: RTCRtpSender): EncoderClamp | null {
  return encoderClamps.get(sender) ?? null;
}

/**
 * v0.4.27 — lift a clamp applied on a false positive.
 *
 * There was previously no way to remove a clamp at all: the detector set one
 * on a SINGLE software reading and the WeakMap entry lived for the sender's
 * lifetime, so a share that briefly reported OpenH264 while Media Foundation
 * was still initialising ran the rest of its life at 720p30/3Mbps on a GPU
 * with working NVENC. Callers apply hysteresis before calling this.
 */
export function clearEncoderClamp(sender: RTCRtpSender): boolean {
  return encoderClamps.delete(sender);
}

async function applyEncoding(
  sender: RTCRtpSender,
  bitrate: number,
  fps: number,
  scale: number,
  degradationPreference: RTCDegradationPreference = "maintain-framerate",
) {
  const clamp = encoderClamps.get(sender);
  if (clamp) {
    bitrate = Math.min(bitrate, clamp.maxBitrate);
    fps = Math.min(fps, clamp.maxFramerate);
    scale = Math.max(scale, clamp.minScale);
  }
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  // v0.4.18 — with simulcast, tune the `f` (full) layer explicitly. Fall
  // back to index 0 for the low-power single-layer path.
  const idx = params.encodings.findIndex((e: any) => e.rid === "f");
  const target = params.encodings[idx >= 0 ? idx : 0] as any;
  target.maxBitrate = Math.round(bitrate);
  target.maxFramerate = Math.round(fps);
  target.scaleResolutionDownBy = Math.max(1, +scale.toFixed(2));
  (params as any).degradationPreference = degradationPreference;
  await sender.setParameters(params);
}



/**
 * One mixed-content controller for DM, group, and server shares. It starts at
 * a sustainable bitrate so the first keyframes are usable, ramps quickly,
 * treats packet loss as a network problem, and treats missed frames/encode
 * time as a resolution problem instead of blindly starving the encoder.
 */
export function startAutomaticScreenEncoding(
  sender: RTCRtpSender,
  pc: RTCPeerConnection,
  target: AutomaticScreenEncoding,
): () => void {
  let stopped = false;
  // v0.4.18 — the previous controller treated any RTT wiggle or momentary
  // fps dip (perfectly normal during a fast game scene) as "network
  // saturated" and slashed bitrate 25 % per tick, then floored at 600 kbps.
  // Result: the peer saw a 6 Mbps stream collapse to ~800 kbps within a few
  // seconds of any real motion and never recovered. This one holds the
  // user-selected ceiling, uses a strict floor of 60 % of target, and only
  // reacts to *sustained* pressure (loss > 8 %, bandwidth-limited by
  // Chromium, or RTT sitting > 150 ms above baseline for 4+ samples).
  const peerCount = () => Math.max(1, target.getPeerCount?.() ?? 1);
  const perPeerTarget = () => calculatePerPeerScreenBudget(target.targetBitrate, peerCount());
  // v0.4.27 — RAMP, don't slam. This used to force-apply 65% of the target on
  // the very first tick: for a 1440p60 share that is ~5.9 Mbps pushed onto a
  // link whose capacity is still unknown, which is what spiked call ping the
  // moment a share started. Voice and screenshare are separate
  // PeerConnections with independent bandwidth estimates, so nothing arbitrates
  // between them — the only safe move is to start modest and climb.
  let bitrate = Math.round(perPeerTarget() * RAMP_START_FRACTION);
  let rampStepsLeft = RAMP_STEPS;
  let scale = Math.max(1, target.baseScale);
  // v0.4.30 — the floor is what the stream looks like when the network hiccups.
  // 25% of target (min 350 kbps) is a slideshow for a game share; hold at least
  // 40% of the user's pick so a picked quality stays recognisably that quality.
  const bitrateFloor = () => Math.min(2_200_000, Math.max(700_000, Math.round(perPeerTarget() * 0.4)));
  let cleanSamples = 0;
  let cpuSamples = 0;
  let lastLost = 0;
  let lastReceived = 0;
  // Keyed by report id: with simulcast there are THREE outbound-rtp video
  // reports (rid f/h/q) per getStats() pass. Single scalars meant each report
  // overwrote the previous one's counters, so `framesEncoded - lastFrames`
  // compared one layer against another and produced garbage encode times —
  // which then tripped the "CPU limited" downscale on a perfectly healthy
  // hardware encoder.
  const lastFramesById = new Map<string, number>();
  const lastEncodeTimeById = new Map<string, number>();
  // Rolling min-RTT baseline over the last ~40 s (20 samples @ 2 s) so a
  // brief spike doesn't dominate.
  const rttWindow: number[] = [];

  // v0.4.22 — stability. The loop used to re-apply parameters every 2 s and
  // react to a single bad sample, so quality visibly oscillated for the whole
  // share. Now: a warm-up window where we never downshift, two consecutive
  // pressure samples before any backoff, a cooldown between adjustments, and
  // setParameters only when the value actually moved.
  // v0.4.28 — content class is measured continuously, not chosen by the user.
  const classifier = createContentClassifier("mixed");
  let profile = profileFor(classifier.current, target.targetFps);
  let degradation: RTCDegradationPreference = target.degradationPreference ?? profile.degradationPreference;
  // IMPORTANT: do NOT apply the starting class's fps cap before anything has
  // been measured. The opening class is "mixed", whose cap is 30 — applying it
  // up front meant every game share opened at 30fps and only reached the
  // user's 60 once the classifier had confirmed motion a few samples later.
  // Balanced degradation is a safe opening posture; a reduced frame rate is
  // not. The cap starts applying from the first real classification.
  let fpsTarget = target.targetFps;
  const applyContentProfile = (cls: ScreenContentClass) => {
    profile = profileFor(cls, target.targetFps);
    degradation = profile.degradationPreference;
    fpsTarget = Math.min(target.targetFps, profile.maxFps);
    // contentHint steers libwebrtc's own encoder tuning; re-applying it on a
    // live track is how a browser that starts playing a video gets re-tuned
    // without restarting the share.
    try { if (target.track) (target.track as any).contentHint = profile.contentHint; } catch { /* ignore */ }
    console.log(
      `[ScreenShare] content is now ${cls} → hint=${profile.contentHint}, ` +
      `degradation=${profile.degradationPreference}, fps<=${profile.maxFps}`
    );
  };
  const COOLDOWN_MS = 3_000;
  let lastAdjustAt = 0;
  let appliedBitrate = 0;
  let appliedScale = 0;

  const update = async (force = false) => {
    const bitrateMoved = appliedBitrate === 0 || Math.abs(bitrate - appliedBitrate) / appliedBitrate > 0.08;
    const scaleMoved = Math.abs(scale - appliedScale) > 0.01;
    if (!force && !bitrateMoved && !scaleMoved) return;
    appliedBitrate = bitrate;
    appliedScale = scale;
    await applyEncoding(sender, bitrate, fpsTarget, scale, degradation).catch(() => {});
  };
  // Start AT the target instead of discovering it: the first apply is forced
  // so the very first frames are already full quality.
  void update(true);
  prioritizeVoiceOverScreen(pc, target.voicePc);

  // Force an immediate keyframe so the very first frame the peer decodes is
  // full quality instead of a smeared low-bitrate I-frame from the encoder's
  // cold start.
  const ramps: number[] = [
    window.setTimeout(() => {
      if (stopped) return;
      try { (sender as any).generateKeyFrame?.(); } catch {}
    }, 250),
  ];


  const interval = window.setInterval(async () => {
    if (stopped || pc.connectionState === "closed") return;
    let force = false;
    try {
      const stats = await pc.getStats();
      const voiceStats = target.voicePc && target.voicePc !== pc
        ? await target.voicePc.getStats().catch(() => null)
        : null;
      let loss = 0;
      let fps = target.targetFps;
      // Whether `fps` above is a real measurement or still the requested value.
      let fpsMeasured = false;
      let cpuLimited = false;
      let bandwidthLimited = false;
      let rttMs = 0;
      let availableOutgoingBitrate = 0;
      stats.forEach((report: any) => {
        if (report.type === "remote-inbound-rtp" && report.kind === "video") {
          const lost = report.packetsLost ?? 0;
          const received = report.packetsReceived ?? 0;
          const deltaLost = Math.max(0, lost - lastLost);
          const deltaReceived = Math.max(0, received - lastReceived);
          lastLost = lost;
          lastReceived = received;
          const total = deltaLost + deltaReceived;
          if (total > 0) loss = deltaLost / total;
          if (typeof report.roundTripTime === "number") rttMs = report.roundTripTime * 1000;
        }
        if (report.type === "outbound-rtp" && report.kind === "video") {
          if (typeof report.framesPerSecond === "number") { fps = report.framesPerSecond; fpsMeasured = true; }
          const id = String(report.id ?? report.ssrc ?? "0");
          const frames = report.framesEncoded ?? 0;
          const encodeTime = report.totalEncodeTime ?? 0;
          const deltaFrames = Math.max(0, frames - (lastFramesById.get(id) ?? frames));
          const deltaEncode = Math.max(0, encodeTime - (lastEncodeTimeById.get(id) ?? encodeTime));
          lastFramesById.set(id, frames);
          lastEncodeTimeById.set(id, encodeTime);
          const encodeMsPerFrame = deltaFrames > 0 ? (deltaEncode * 1000) / deltaFrames : 0;
          // CPU limit only when Chromium explicitly says so or the encoder
          // is spending nearly a whole frame budget encoding — not on brief
          // fps dips (games render bursty frames). OR across layers: any
          // struggling layer means the encoder as a whole is struggling.
          cpuLimited = cpuLimited
            || report.qualityLimitationReason === "cpu"
            || encodeMsPerFrame > (1000 / target.targetFps) * 1.1;
          if (report.qualityLimitationReason === "bandwidth") bandwidthLimited = true;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) {
          availableOutgoingBitrate = Math.max(availableOutgoingBitrate, report.availableOutgoingBitrate ?? 0);
          if (!rttMs && typeof report.currentRoundTripTime === "number") rttMs = report.currentRoundTripTime * 1000;
        }
      });
      voiceStats?.forEach((report: any) => {
        if (report.type === "candidate-pair" && report.state === "succeeded" && report.nominated && typeof report.currentRoundTripTime === "number") {
          rttMs = report.currentRoundTripTime * 1000;
        }
        if (report.type === "remote-inbound-rtp" && report.kind === "audio" && typeof report.roundTripTime === "number") {
          rttMs = report.roundTripTime * 1000;
        }
      });

      if (rttMs > 0) {
        rttWindow.push(rttMs);
        if (rttWindow.length > 20) rttWindow.shift();
      }
      const baselineRtt = rttWindow.length ? Math.min(...rttWindow) : 0;
      // v0.4.28 — measure content activity and re-tune if the class changed.
      // Prefer the native capture rate (WGC emits only on content change, so it
      // IS the content-activity signal); fall back to the encoder's own fps.
      const nativeFps = target.getNativeCaptureFps?.() ?? null;
      const observedFps = nativeFps != null && nativeFps >= 0
        ? nativeFps
        : (fpsMeasured ? fps : null);
      // Never classify on a guess. Until a real measurement exists the
      // classifier is not fed at all, so it holds its starting class instead of
      // reading the REQUESTED frame rate as though the content were moving that
      // fast — which classified every share as full motion for its first ticks.
      if (observedFps != null) {
        const switched = classifier.observe(observedFps);
        if (switched) { applyContentProfile(switched); force = true; }
      }

      const now = Date.now();
      const cooling = now - lastAdjustAt < COOLDOWN_MS;
      // Climb toward the target while the link looks healthy. Congestion
      // handling below can still cut at any point during the ramp.
      if (rampStepsLeft > 0) {
        rampStepsLeft--;
        bitrate = Math.min(perPeerTarget(), Math.round(bitrate * RAMP_STEP_FACTOR));
      }
      const decision = nextScreenBitrate({
        bitrate,
        targetBitrate: perPeerTarget(),
        floorBitrate: bitrateFloor(),
        availableOutgoingBitrate,
        loss,
        rttMs,
        baselineRttMs: baselineRtt,
        bandwidthLimited,
        cleanSamples,
      });
      cleanSamples = decision.cleanSamples;
      if ((!cooling || decision.reason !== "probe") && decision.bitrate !== bitrate) {
        // Congestion beat the ramp to it — stop climbing and let the normal
        // probe path find the ceiling from below.
        if (decision.bitrate < bitrate) rampStepsLeft = 0;
        bitrate = decision.bitrate;
        lastAdjustAt = now;
      }

      // Preserve motion cadence under a constrained uplink: step resolution
      // down before touching the requested frame rate, then restore it slowly.
      const bitrateRatio = bitrate / Math.max(1, perPeerTarget());
      // v0.4.30 — only drop resolution when the budget really collapsed, and
      // never below half of the picked height (was 2.5x = a 1080p pick landing
      // at ~432p).
      if (bitrateRatio < 0.35) {
        scale = Math.min(Math.max(target.baseScale, 2), scale * 1.2);
      } else if (decision.reason === "probe" && scale > target.baseScale) {
        scale = Math.max(target.baseScale, scale / 1.1);
      }

      cpuSamples = cpuLimited ? cpuSamples + 1 : 0;
      if (cpuSamples >= 4) {
        scale = Math.min(Math.max(target.baseScale, 2), scale * 1.15);
        cpuSamples = 0;
      } else if (!cpuLimited && cleanSamples >= 3 && scale > target.baseScale) {
        // Was `>= 6`, which could never be true: nextScreenBitrate resets
        // cleanSamples to 0 the moment it reaches 4, so this recovery branch
        // was dead code and a CPU-triggered downscale never came back up
        // except by way of the slower bitrate-probe path below.
        scale = Math.max(target.baseScale, scale / 1.15);
      }
      await update(force);
      if (import.meta.env.DEV) {
        console.debug("[ScreenShare] transport", { bitrate: Math.round(bitrate), availableOutgoingBitrate, rttMs: Math.round(rttMs), baselineRtt: Math.round(baselineRtt), loss, scale, peers: peerCount(), reason: decision.reason });
      }
    } catch {}
  }, 2_000);


  return () => {
    stopped = true;
    ramps.forEach(window.clearTimeout);
    window.clearInterval(interval);
  };
}