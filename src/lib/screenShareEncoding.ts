export interface AutomaticScreenEncoding {
  targetBitrate: number;
  targetFps: number;
  targetHeight: number;
  baseScale: number;
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
  let bitrate = Math.min(target.targetBitrate, Math.max(750_000, target.targetBitrate * 0.55));
  let scale = Math.max(1, target.baseScale);
  let cleanSamples = 0;
  let cpuSamples = 0;
  let lastLost = 0;
  let lastReceived = 0;
  let lastFrames = 0;
  let lastEncodeTime = 0;

  const update = () => applyEncoding(sender, bitrate, target.targetFps, scale).catch(() => {});
  void update();

  // Fast, controlled startup ramp: avoid a blocky full-ceiling first keyframe,
  // but do not wait for Chromium's much slower default bandwidth convergence.
  const ramps = [
    window.setTimeout(() => {
      if (stopped) return;
      bitrate = Math.min(target.targetBitrate, Math.max(bitrate, target.targetBitrate * 0.78));
      void update();
    }, 900),
    window.setTimeout(() => {
      if (stopped) return;
      bitrate = target.targetBitrate;
      void update();
      try { (sender as any).generateKeyFrame?.(); } catch {}
    }, 2_200),
  ];

  const interval = window.setInterval(async () => {
    if (stopped || pc.connectionState === "closed") return;
    try {
      const stats = await pc.getStats();
      let loss = 0;
      let fps = target.targetFps;
      let cpuLimited = false;
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
        }
      });

      if (loss > 0.05) {
        cleanSamples = 0;
        bitrate = Math.max(450_000, bitrate * 0.78);
      } else if (loss < 0.015) {
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