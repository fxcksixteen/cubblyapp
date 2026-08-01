export interface AutomaticScreenEncoding {
  targetBitrate: number;
  targetFps: number;
  targetHeight: number;
  baseScale: number;
}

/**
 * Discord-style SDP munging for the video m-line(s): raises the encoder's
 * initial bitrate + max ceiling so Chromium's Google Congestion Control does
 * NOT cold-start at ~300 kbps and slowly ramp for 10-15 s (the exact reason
 * every screenshare starts blurry then "stabilizes" after ~15 s).
 *
 *  - `b=AS:` sets the SDP-advertised max for the video m-section.
 *  - `x-google-start-bitrate` / `-min-bitrate` / `-max-bitrate` are honored by
 *    libwebrtc's VP8/VP9/H.264/AV1 encoders and short-circuit the slow-start.
 *
 * Safe to run on any local SDP — no-ops when there's no video m-line and
 * ignored by remote endpoints that don't recognize the fmtp params.
 */
export function patchScreenShareVideoSdp(
  sdp: string | undefined | null,
  opts: { startKbps: number; minKbps: number; maxKbps: number },
): string {
  if (!sdp) return sdp || "";
  const startKbps = Math.max(300, Math.round(opts.startKbps));
  const minKbps = Math.max(150, Math.round(opts.minKbps));
  const maxKbps = Math.max(startKbps, Math.round(opts.maxKbps));

  const eol = sdp.includes("\r\n") ? "\r\n" : "\n";
  const lines = sdp.split(/\r?\n/);

  // Pass 1: insert b=AS/TIAS after the c= line of each video section, and
  // record video payload types for fmtp patching.
  let inVideo = false;
  const videoPayloads = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    if (line.startsWith("m=")) {
      inVideo = line.startsWith("m=video");
      out.push(line);
      if (inVideo) {
        const parts = line.split(" ");
        parts.slice(3).forEach((p) => videoPayloads.add(p));
      }
      continue;
    }
    if (inVideo && line.startsWith("c=")) {
      out.push(line);
      out.push(`b=AS:${maxKbps}`);
      out.push(`b=TIAS:${maxKbps * 1000}`);
      continue;
    }
    out.push(line);
  }

  // Pass 2: patch existing a=fmtp lines for video PTs.
  const seenFmtp = new Set<string>();
  const patched = out.map((line) => {
    const m = line.match(/^a=fmtp:(\d+) (.*)$/);
    if (!m || !videoPayloads.has(m[1])) return line;
    const existing = m[2]
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s && !/^x-google-(start|min|max)-bitrate=/i.test(s));
    existing.push(
      `x-google-start-bitrate=${startKbps}`,
      `x-google-min-bitrate=${minKbps}`,
      `x-google-max-bitrate=${maxKbps}`,
    );
    seenFmtp.add(m[1]);
    return `a=fmtp:${m[1]} ${existing.join(";")}`;
  });

  // Pass 3: for any video PT without an fmtp line, append one at the end of
  // the video m-section.
  const paramStr = `x-google-start-bitrate=${startKbps};x-google-min-bitrate=${minKbps};x-google-max-bitrate=${maxKbps}`;
  const finalOut: string[] = [];
  let bufSectionVideo = false;
  let buffer: string[] = [];
  const flush = () => {
    if (bufSectionVideo) {
      videoPayloads.forEach((pt) => {
        if (!seenFmtp.has(pt)) buffer.push(`a=fmtp:${pt} ${paramStr}`);
      });
    }
    finalOut.push(...buffer);
    buffer = [];
  };
  for (const line of patched) {
    if (line.startsWith("m=")) { flush(); bufSectionVideo = line.startsWith("m=video"); }
    buffer.push(line);
  }
  flush();

  return finalOut.join(eol);
}


/**
 * v0.4.22 — keep voice ahead of the screen encoder.
 *
 * When a share saturates the uplink, Chromium splits the estimate across all
 * senders on the connection. Marking the audio sender high-priority (and the
 * video sender low) makes the pacer service voice packets first, which is why
 * calls used to stutter the moment a game share started.
 */
export function prioritizeVoiceOverScreen(pc: RTCPeerConnection) {
  try {
    pc.getSenders().forEach((sender) => {
      const kind = sender.track?.kind;
      if (!kind) return;
      const params = sender.getParameters();
      if (!params.encodings?.length) return;
      params.encodings.forEach((enc: any) => {
        if (kind === "audio") {
          enc.priority = "high";
          enc.networkPriority = "high";
        } else if (enc.networkPriority === "high") {
          enc.networkPriority = "medium";
        }
      });
      void sender.setParameters(params).catch(() => {});
    });
  } catch {}
}

async function applyEncoding(
  sender: RTCRtpSender,
  bitrate: number,
  fps: number,
  scale: number,
) {
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  // v0.4.18 — with simulcast, tune the `f` (full) layer explicitly. Fall
  // back to index 0 for the low-power single-layer path.
  const idx = params.encodings.findIndex((e: any) => e.rid === "f");
  const target = params.encodings[idx >= 0 ? idx : 0] as any;
  target.maxBitrate = Math.round(bitrate);
  target.maxFramerate = Math.round(fps);
  target.scaleResolutionDownBy = Math.max(1, +scale.toFixed(2));
  (params as any).degradationPreference = "maintain-framerate";
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
  let bitrate = target.targetBitrate;
  let scale = Math.max(1, target.baseScale);
  const bitrateFloor = Math.round(target.targetBitrate * 0.6);
  let cleanSamples = 0;
  let cpuSamples = 0;
  let bloatSamples = 0;
  let lastLost = 0;
  let lastReceived = 0;
  let lastFrames = 0;
  let lastEncodeTime = 0;
  // Rolling min-RTT baseline over the last ~40 s (20 samples @ 2 s) so a
  // brief spike doesn't dominate.
  const rttWindow: number[] = [];

  // v0.4.22 — stability. The loop used to re-apply parameters every 2 s and
  // react to a single bad sample, so quality visibly oscillated for the whole
  // share. Now: a warm-up window where we never downshift, two consecutive
  // pressure samples before any backoff, a cooldown between adjustments, and
  // setParameters only when the value actually moved.
  const startedAt = Date.now();
  const WARMUP_MS = 8_000;
  const COOLDOWN_MS = 6_000;
  let lastAdjustAt = 0;
  let pressureSamples = 0;
  let appliedBitrate = 0;
  let appliedScale = 0;

  const update = async (force = false) => {
    const bitrateMoved = appliedBitrate === 0 || Math.abs(bitrate - appliedBitrate) / appliedBitrate > 0.08;
    const scaleMoved = Math.abs(scale - appliedScale) > 0.01;
    if (!force && !bitrateMoved && !scaleMoved) return;
    appliedBitrate = bitrate;
    appliedScale = scale;
    await applyEncoding(sender, bitrate, target.targetFps, scale).catch(() => {});
  };
  // Start AT the target instead of discovering it: the first apply is forced
  // so the very first frames are already full quality.
  void update(true);
  prioritizeVoiceOverScreen(pc);

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
    try {
      const stats = await pc.getStats();
      let loss = 0;
      let fps = target.targetFps;
      let cpuLimited = false;
      let bandwidthLimited = false;
      let rttMs = 0;
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
          fps = report.framesPerSecond ?? fps;
          const frames = report.framesEncoded ?? 0;
          const encodeTime = report.totalEncodeTime ?? 0;
          const deltaFrames = Math.max(0, frames - lastFrames);
          const deltaEncode = Math.max(0, encodeTime - lastEncodeTime);
          lastFrames = frames;
          lastEncodeTime = encodeTime;
          const encodeMsPerFrame = deltaFrames > 0 ? (deltaEncode * 1000) / deltaFrames : 0;
          // CPU limit only when Chromium explicitly says so or the encoder
          // is spending nearly a whole frame budget encoding — not on brief
          // fps dips (games render bursty frames).
          cpuLimited = report.qualityLimitationReason === "cpu"
            || encodeMsPerFrame > (1000 / target.targetFps) * 1.1;
          if (report.qualityLimitationReason === "bandwidth") bandwidthLimited = true;
        }
      });

      if (rttMs > 0) {
        rttWindow.push(rttMs);
        if (rttWindow.length > 20) rttWindow.shift();
      }
      const baselineRtt = rttWindow.length ? Math.min(...rttWindow) : 0;
      // Only count as "bloated" if RTT sits well above baseline. 60 ms was
      // way too tight for gaming — a Valorant round routinely swings 40 ms.
      const bloated = baselineRtt > 0 && rttMs > baselineRtt + 150;
      bloatSamples = bloated ? bloatSamples + 1 : Math.max(0, bloatSamples - 1);

      const bandwidthPressure = loss > 0.08 || bandwidthLimited || bloatSamples >= 4;
      const clearlyClean = loss < 0.02 && !bandwidthLimited && (baselineRtt === 0 || rttMs <= baselineRtt + 40);

      const now = Date.now();
      const warmingUp = now - startedAt < WARMUP_MS;
      const cooling = now - lastAdjustAt < COOLDOWN_MS;

      pressureSamples = bandwidthPressure ? pressureSamples + 1 : 0;

      if (pressureSamples >= 2 && !warmingUp && !cooling) {
        cleanSamples = 0;
        pressureSamples = 0;
        lastAdjustAt = now;
        // Gentler backoff (10 %) with a high floor so a burst of loss can't
        // knock the stream down to a blur.
        bitrate = Math.max(bitrateFloor, bitrate * 0.9);
        if (bloatSamples >= 4) bloatSamples = 2;
      } else if (clearlyClean) {
        cleanSamples += 1;
        if (cleanSamples >= 3 && !cooling && bitrate < target.targetBitrate) {
          lastAdjustAt = now;
          bitrate = Math.min(target.targetBitrate, bitrate * 1.2);
        }
      } else if (!bandwidthPressure) {
        cleanSamples = 0;
      }

      cpuSamples = cpuLimited && !warmingUp ? cpuSamples + 1 : 0;
      if (cpuSamples >= 4) {
        scale = Math.min(Math.max(target.baseScale, 2), scale * 1.15);
        cpuSamples = 0;
      } else if (!cpuLimited && cleanSamples >= 6 && scale > target.baseScale) {
        scale = Math.max(target.baseScale, scale / 1.15);
      }
      await update();
    } catch {}
  }, 2_000);


  return () => {
    stopped = true;
    ramps.forEach(window.clearTimeout);
    window.clearInterval(interval);
  };
}