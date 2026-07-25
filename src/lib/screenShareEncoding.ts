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


async function applyEncoding(
  sender: RTCRtpSender,
  bitrate: number,
  fps: number,
  scale: number,
) {
  const params = sender.getParameters();
  if (!params.encodings?.length) params.encodings = [{}];
  params.encodings[0].maxBitrate = Math.round(bitrate);
  (params.encodings[0] as any).maxFramerate = Math.round(fps);
  (params.encodings[0] as any).scaleResolutionDownBy = Math.max(1, +scale.toFixed(2));
  (params.encodings[0] as any).networkPriority = "high";
  (params.encodings[0] as any).priority = "high";
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
  // v0.4.17 — open at the full user-selected ceiling, but back off fast on
  // ANY of: packet loss, RTT growth (bufferbloat = saturated uplink), or
  // Chromium reporting bandwidth/network qualityLimitationReason. The old
  // controller only reacted to loss, which home routers rarely produce —
  // they queue instead, so the stream sat at 6 Mbps while the user's ping
  // climbed in-game.
  let bitrate = target.targetBitrate;
  let scale = Math.max(1, target.baseScale);
  let cleanSamples = 0;
  let cpuSamples = 0;
  let bloatSamples = 0;
  let lastLost = 0;
  let lastReceived = 0;
  let lastFrames = 0;
  let lastEncodeTime = 0;
  // Rolling min-RTT baseline over the last ~20 s (10 samples @ 2 s).
  const rttWindow: number[] = [];

  const update = () => applyEncoding(sender, bitrate, target.targetFps, scale).catch(() => {});
  void update();

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
      let networkLimited = false;
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
          cpuLimited = report.qualityLimitationReason === "cpu"
            || fps < target.targetFps * 0.65
            || encodeMsPerFrame > (1000 / target.targetFps) * 0.9;
          if (report.qualityLimitationReason === "bandwidth"
            || report.qualityLimitationReason === "network") networkLimited = true;
        }
      });

      // Track a rolling RTT baseline. Bufferbloat = current RTT much higher
      // than the recent floor.
      if (rttMs > 0) {
        rttWindow.push(rttMs);
        if (rttWindow.length > 10) rttWindow.shift();
      }
      const baselineRtt = rttWindow.length ? Math.min(...rttWindow) : 0;
      const bloated = baselineRtt > 0 && rttMs > baselineRtt + 60;
      bloatSamples = bloated ? bloatSamples + 1 : 0;

      const bandwidthPressure = loss > 0.05 || networkLimited || bloatSamples >= 2;
      const clearlyClean = loss < 0.015 && !networkLimited && (baselineRtt === 0 || rttMs <= baselineRtt + 20);

      if (bandwidthPressure) {
        cleanSamples = 0;
        bitrate = Math.max(600_000, bitrate * 0.75);
        if (bloatSamples >= 2) bloatSamples = 0;
      } else if (clearlyClean) {
        cleanSamples += 1;
        if (cleanSamples >= 3) bitrate = Math.min(target.targetBitrate, bitrate * 1.16);
      } else {
        cleanSamples = 0;
      }

      cpuSamples = cpuLimited ? cpuSamples + 1 : 0;
      if (cpuSamples >= 2) {
        scale = Math.min(Math.max(target.baseScale, 3), scale * 1.25);
        cpuSamples = 0;
      } else if (!cpuLimited && cleanSamples >= 4 && scale > target.baseScale) {
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