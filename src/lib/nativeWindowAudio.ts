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
    return { audioTrack: null, stop: () => {} };
  }

  const result = await api.startWindowAudioCapture(sourceId);
  if (!result?.ok) {
    console.warn("[NativeWindowAudio] startWindowAudioCapture failed:", result?.error);
    return { audioTrack: null, stop: () => {} };
  }

  const fmt = result.format || { sampleRate: 48000, channels: 2, floatPcm: true };

  // Web Audio graph: scheduled AudioBufferSourceNodes → GainNode →
  // MediaStreamAudioDestinationNode → MediaStreamTrack.
  const ctx = new AudioContext({ sampleRate: fmt.sampleRate });
  const dest = ctx.createMediaStreamDestination();
  const gain = ctx.createGain();
  gain.gain.value = 1.0;
  gain.connect(dest);
  try {
    if (ctx.state === "suspended") await ctx.resume();
  } catch {}

  let nextStartTime = ctx.currentTime + 0.05; // 50ms initial buffer
  const channels = fmt.channels || 2;
  const sampleRate = fmt.sampleRate || 48000;

  const unsubscribe = api.onWindowAudioPcm((buf: ArrayBuffer | Uint8Array) => {
    try {
      // Native sends float32 interleaved PCM. Deinterleave to per-channel arrays.
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
      const f32 = new Float32Array(u8.buffer, u8.byteOffset, u8.byteLength / 4);
      const framesPerChannel = f32.length / channels;
      if (framesPerChannel <= 0) return;
      const audioBuf = ctx.createBuffer(channels, framesPerChannel, sampleRate);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = new Float32Array(framesPerChannel);
        for (let i = 0; i < framesPerChannel; i++) {
          channelData[i] = f32[i * channels + ch];
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
  }

  const stop = () => {
    try { unsubscribe?.(); } catch {}
    try { api.stopWindowAudioCapture?.(); } catch {}
    try { audioTrack?.stop(); } catch {}
    try { ctx.close(); } catch {}
  };

  return { audioTrack, stop };
}
