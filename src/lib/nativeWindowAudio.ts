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

export async function startNativeWindowAudioStream(sourceId: string): Promise<NativeWindowAudioHandle> {
  const api = (window as any).electronAPI;
  if (!api?.startWindowAudioCapture) {
    console.warn("[NativeWindowAudio] electronAPI.startWindowAudioCapture not exposed — non-Electron or old preload");
    return { audioTrack: null, stop: () => {} };
  }

  console.log("[NativeWindowAudio] ▶ requesting capture for sourceId:", sourceId);
  const t0 = performance.now();
  const result = await api.startWindowAudioCapture(sourceId);
  const dt = (performance.now() - t0).toFixed(0);
  console.log("[NativeWindowAudio] ◀ startWindowAudioCapture returned in " + dt + "ms:", result);
  if (!result?.ok) {
    console.error("[NativeWindowAudio] ❌ FAILED. Full error from main process:");
    console.error("  " + (result?.error || "(no error message)"));
    console.error("[NativeWindowAudio] Hint: error trace above lists EVERY format candidate Windows tried.");
    console.error("  - 'Init=HRESULT 0x80004001' = E_NOTIMPL (process-loopback driver doesn't implement that path)");
    console.error("  - 'Init=HRESULT 0x88890021' = AUDCLNT_E_UNSUPPORTED_FORMAT");
    console.error("  - 'Init=HRESULT 0x88890017' = AUDCLNT_E_DEVICE_IN_USE");
    console.error("  - 'Init=HRESULT 0x8889000F' = AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED");
    console.error("  - If pid=0 in the trace, the HWND→PID resolution failed (check Electron main log).");
    console.error("  - If ALL candidates show E_NOTIMPL, the target process has no active WASAPI session yet — try playing audio in the source app BEFORE starting the share.");
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

  const unsubscribe = api.onWindowAudioPcm((buf: ArrayBuffer | Uint8Array) => {
    try {
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
      if (nextStartTime < now) nextStartTime = now + 0.02;
      src.start(nextStartTime);
      nextStartTime += audioBuf.duration;
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
    try { api.stopWindowAudioCapture?.(); } catch {}
    try { audioTrack?.stop(); } catch {}
    try { ctx.close(); } catch {}
  };

  return { audioTrack, stop };
}
