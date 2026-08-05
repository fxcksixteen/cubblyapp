/**
 * Shared helper: start native WASAPI per-process audio capture for an Electron
 * window/tab source and return a MediaStreamTrack containing ONLY that
 * process's audio.
 *
 * Used by both the 1-on-1 VoiceContext and the GroupCallContext so the two
 * code paths can't drift apart.
 *
 * On any failure (non-Electron, addon missing, old Windows, target process
 * refused loopback) returns `{ audioTrack: null, stop: () => {} }` and the
 * caller should fall back to a video-only share.
 */

export interface NativeWindowAudioHandle {
  audioTrack: MediaStreamTrack | null;
  stop: () => void;
}

export const NATIVE_AUDIO_TARGET_LEAD_SECONDS = 0.045;
/**
 * v0.4.27 — 0.10s, was 0.22s.
 *
 * PCM blocks are scheduled at `nextStartTime += buffer.duration`. The WASAPI
 * capture clock and the AudioContext clock run independently, so the schedule
 * drifts ahead of playback and the added latency climbs until this ceiling
 * trips a hard resync back to TARGET_LEAD. That makes share-audio delay a
 * sawtooth between the target and this cap — at 0.22s the worst case was ~220ms
 * of self-inflicted delay ON TOP of network, encode and jitter buffer, which is
 * why share audio was audibly behind the picture.
 *
 * Halving the ceiling halves the worst case for one constant. It does NOT fix
 * the underlying drift — that needs real rate compensation rather than a
 * periodic resync, which is deferred to 0.4.28 because getting it wrong
 * produces audible artefacts.
 */
export const NATIVE_AUDIO_MAX_LEAD_SECONDS = 0.10;

export function shouldResyncNativeAudio(nextStartTime: number, currentTime: number, capturedAtMs?: number, nowMs = performance.timeOrigin + performance.now()) {
  const staleCapture = typeof capturedAtMs === "number" && nowMs - capturedAtMs > 250;
  return staleCapture || nextStartTime - currentTime > NATIVE_AUDIO_MAX_LEAD_SECONDS;
}

/* ──────────────────────────────────────────────────────────────────────────
   v0.4.28 — DRIFT COMPENSATION

   The WASAPI capture clock and the AudioContext clock are independent crystals.
   They are never exactly equal, so scheduling each block at
   `nextStartTime += buffer.duration` accumulates error in one direction for as
   long as the share runs.

   Until now the only correction was the hard resync above: let the error grow
   to MAX_LEAD, then jump back to TARGET_LEAD. That made share-audio delay a
   sawtooth — it climbed continuously and then snapped, audibly, every time.
   Lowering the ceiling in 0.4.27 halved the amplitude but kept the shape.

   This replaces it with a proportional correction. We measure the lead every
   block, compare it to the target, and nudge each block's PLAYBACK RATE by a
   fraction of a percent to walk the error back to zero. At <=0.5% the pitch
   shift is well below the threshold of audibility (a semitone is ~6%), so the
   correction is continuous and inaudible instead of periodic and jarring.

   The hard resync remains as a backstop for real discontinuities — the capture
   stalling, the window closing, the machine sleeping — where no rate nudge
   could ever catch up.
   ────────────────────────────────────────────────────────────────────────── */

/** Maximum playback-rate correction. 0.5% is far below audible pitch shift. */
export const MAX_RATE_CORRECTION = 0.005;
/** Lead error below this is left alone — chasing it would add jitter. */
export const RATE_DEADBAND_SECONDS = 0.008;
/**
 * Proportional gain: how aggressively error is converted into rate correction.
 * Tuned so a 50ms error produces roughly half the maximum correction, which
 * walks it out over a few seconds rather than instantly.
 */
export const RATE_CORRECTION_GAIN = 0.05;

/**
 * Playback rate for the next block given how far ahead of the target the
 * schedule has drifted.
 *
 * @param leadSeconds how far ahead of `currentTime` the next block is queued
 * @param targetLead  where we want that to sit
 * @returns a rate near 1.0 — >1 plays slightly faster to burn off a lead,
 *          <1 slightly slower to let playback catch up to a deficit.
 */
export function driftCorrectedRate(leadSeconds: number, targetLead = NATIVE_AUDIO_TARGET_LEAD_SECONDS): number {
  const error = leadSeconds - targetLead;
  if (Math.abs(error) <= RATE_DEADBAND_SECONDS) return 1;
  const correction = Math.max(
    -MAX_RATE_CORRECTION,
    Math.min(MAX_RATE_CORRECTION, error * RATE_CORRECTION_GAIN),
  );
  return 1 + correction;
}

export async function startNativeWindowAudioStream(sourceId: string): Promise<NativeWindowAudioHandle> {
  const api = (window as any).electronAPI;
  if (!api?.startWindowAudioCapture) {
    console.warn("[NativeWindowAudio] electronAPI.startWindowAudioCapture not exposed — non-Electron or old preload");
    return { audioTrack: null, stop: () => {} };
  }

  console.log("[NativeWindowAudio] ▶ requesting capture for sourceId:", sourceId);
  const t0 = performance.now();
  // Hard 2s timeout so a stuck native init can never freeze the renderer / call.
  let result: any;
  try {
    result = await Promise.race([
      api.startWindowAudioCapture(sourceId),
      new Promise((_, rej) => setTimeout(() => rej(new Error("native audio init timed out after 2000ms")), 2000)),
    ]);
  } catch (e: any) {
    console.error("[NativeWindowAudio] ❌ native init threw / timed out:", e?.message || e);
    try {
      window.dispatchEvent(new CustomEvent("cubbly-winaudio-error", { detail: { error: e?.message || "timeout" } }));
    } catch {}
    return { audioTrack: null, stop: () => {} };
  }
  const dt = (performance.now() - t0).toFixed(0);
  console.log("[NativeWindowAudio] ◀ startWindowAudioCapture returned in " + dt + "ms:", result);
  if (!result?.ok) {
    console.error("[NativeWindowAudio] ❌ FAILED. Full error from main process:");
    console.error("  " + (result?.error || "(no error message)"));
    // Surface the error so the UI can tell the user instead of silently
    // falling back to video-only.
    try {
      window.dispatchEvent(new CustomEvent("cubbly-winaudio-error", { detail: { error: result?.error || "unknown" } }));
    } catch {}
    return { audioTrack: null, stop: () => {} };
  }
  console.log("[NativeWindowAudio] ✅ capture started, format:", result.format);

  const fmt = result.format || { sampleRate: 44100, channels: 2, floatPcm: false, bitsPerSample: 16 };

  const ctx = new AudioContext({ sampleRate: fmt.sampleRate });
  const dest = ctx.createMediaStreamDestination();
  const gain = ctx.createGain();
  gain.gain.value = 1.0;
  gain.connect(dest);
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {}

  let nextStartTime = ctx.currentTime + 0.05;
  const channels = fmt.channels || 2;
  const sampleRate = fmt.sampleRate || 44100;
  const isFloat = !!fmt.floatPcm;
  const bytesPerSample = isFloat ? 4 : 2;
  let pcmFramesReceived = 0;
  let droppedStaleFrames = 0;
  let resyncCount = 0;
  const scheduledSources = new Set<AudioBufferSourceNode>();

  const unsubscribe = api.onWindowAudioPcm((payload: ArrayBuffer | Uint8Array | { data: ArrayBuffer | Uint8Array; capturedAtMs?: number }) => {
    try {
      const buf = payload && typeof payload === "object" && "data" in payload ? payload.data : payload;
      const capturedAtMs = payload && typeof payload === "object" && "data" in payload ? payload.capturedAtMs : undefined;
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
      const totalSamples = u8.byteLength / bytesPerSample;
      const framesPerChannel = totalSamples / channels;
      if (framesPerChannel <= 0) return;
      pcmFramesReceived++;
      if (pcmFramesReceived === 1 || pcmFramesReceived === 50) {
        console.log("[NativeWindowAudio] PCM frame #" + pcmFramesReceived + ", frames=" + framesPerChannel + ", isFloat=" + isFloat);
      }

      // Source view: Float32 (legacy) or Int16 (current native impl).
      let getSample: (i: number) => number;
      if (isFloat) {
        const f32 = new Float32Array(u8.buffer, u8.byteOffset, totalSamples);
        getSample = (i) => f32[i];
      } else {
        const i16 = new Int16Array(u8.buffer, u8.byteOffset, totalSamples);
        getSample = (i) => i16[i] / 32768;
      }

      const audioBuf = ctx.createBuffer(channels, framesPerChannel, sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = new Float32Array(framesPerChannel);
        for (let i = 0; i < framesPerChannel; i++) {
          channelData[i] = getSample(i * channels + ch);
        }
        audioBuf.copyToChannel(channelData, ch);
      }
      const src = ctx.createBufferSource();
      src.buffer = audioBuf;
      src.connect(gain);
      const now = ctx.currentTime;
      if (shouldResyncNativeAudio(nextStartTime, now, capturedAtMs)) {
        scheduledSources.forEach((queued) => { try { queued.stop(); } catch {} });
        scheduledSources.clear();
        nextStartTime = now + NATIVE_AUDIO_TARGET_LEAD_SECONDS;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(1, now + 0.025);
        resyncCount++;
        droppedStaleFrames++;
        if (import.meta.env.DEV) console.debug("[NativeWindowAudio] resynced", { resyncCount, droppedStaleFrames });
      } else if (nextStartTime < now) {
        nextStartTime = now + NATIVE_AUDIO_TARGET_LEAD_SECONDS;
      }
      // Continuous drift correction: nudge this block's rate so the schedule
      // walks back toward the target lead instead of sawtoothing between the
      // target and the resync ceiling.
      const lead = nextStartTime - now;
      const rate = driftCorrectedRate(lead);
      try { src.playbackRate.value = rate; } catch { /* ignore */ }
      if (import.meta.env.DEV && pcmFramesReceived % 200 === 0) {
        console.debug("[NativeWindowAudio] lead", (lead * 1000).toFixed(0) + "ms", "rate", rate.toFixed(5));
      }
      scheduledSources.add(src);
      src.onended = () => scheduledSources.delete(src);
      src.start(nextStartTime);
      // Advance by the block's REAL duration at the corrected rate — that is
      // what the context will actually consume.
      nextStartTime += audioBuf.duration / rate;
    } catch (e) {
      console.warn("[NativeWindowAudio] PCM frame decode failed:", e);
    }
  });

  const audioTrack = dest.stream.getAudioTracks()[0] || null;
  if (audioTrack) {
    try { audioTrack.enabled = true; } catch {}
    console.log("[NativeWindowAudio] outgoing audio track ready:", audioTrack.label, "enabled=", audioTrack.enabled);
  } else {
    console.warn("[NativeWindowAudio] no audio track produced from MediaStreamDestination");
  }

  const stop = () => {
    try { unsubscribe?.(); } catch {}
    scheduledSources.forEach((src) => { try { src.stop(); } catch {} });
    scheduledSources.clear();
    try { api.stopWindowAudioCapture?.(); } catch {}
    try { audioTrack?.stop(); } catch {}
    try { ctx.close(); } catch {}
  };

  return { audioTrack, stop };
}
