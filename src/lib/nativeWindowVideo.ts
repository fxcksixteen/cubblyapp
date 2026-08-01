/**
 * Shared helper: start native Windows Graphics Capture for an Electron window
 * source and return a MediaStreamTrack carrying ONLY that window's pixels.
 *
 * Mirrors nativeWindowAudio.ts so the two native-capture paths stay symmetric.
 *
 * DESIGN RULE — SILENT FALLBACK:
 * Unlike the audio helper (which dispatches `cubbly-winaudio-error` so the UI
 * can tell the user per-window audio failed), video failure must be invisible.
 * getDisplayMedia already works everywhere; the native path is a pure upgrade.
 * So every failure mode below returns `{ videoTrack: null, stop: () => {} }`
 * and the caller silently proceeds with getDisplayMedia. Nothing is surfaced
 * to the user, and nothing throws.
 */

export interface NativeWindowVideoStats {
  elapsedMs: number;
  /** Frames that arrived over IPC from the main process. */
  received: number;
  /** Frames written into the track generator. */
  written: number;
  /** Dropped because a previous write was still in flight. */
  droppedBackpressure: number;
  bytesReceived: number;
  /** FrameArrived (native) -> writer.write() resolved, microseconds. */
  endToEndUs: { p50: number; p95: number; max: number };
}

export interface NativeWindowVideoHandle {
  videoTrack: MediaStreamTrack | null;
  stop: () => void;
  /** Renderer-side instrumentation; null when the native path wasn't used. */
  getStats?: () => NativeWindowVideoStats | null;
}

export interface NativeWindowVideoOptions {
  /**
   * Target capture rate. Enforced in the main process before IPC, so capped
   * frames cost nothing (see electron/framePacer.cjs). 0 = uncapped.
   *
   * Callers should pass the user's configured screenshare fps, clamped to
   * NATIVE_CAPTURE_FPS_CEILING. Defaults to that ceiling.
   */
  maxFps?: number;
  /** How long to wait for the first real frame before giving up (ms). */
  firstFrameTimeoutMs?: number;
}

const NONE: NativeWindowVideoHandle = { videoTrack: null, stop: () => {}, getStats: () => null };

/**
 * Hard ceiling on native capture rate, independent of the user's fps setting.
 *
 * WHY 30 AND NOT 60: there is no flow control between the main process and the
 * renderer — main sends every paced frame via webContents.send regardless of
 * whether the renderer is keeping up, so a starved renderer lets the IPC queue
 * grow without bound.
 *
 * Measured at 1080p, VP9, under 12 busy-loop workers on 8 cores:
 *   60fps: main sent 8046 frames, renderer received 5294. ~2750 frames stuck
 *          in the IPC queue. End-to-end latency p50 20.2 SECONDS, p99 46.2s.
 *          The 60s test timer itself took 136.9s of wall clock.
 *   30fps: main sent 1806, renderer received 1803 — queue stays empty.
 *          End-to-end p50 81ms, p95 477ms, p99 721ms. Degraded but usable.
 *
 * Unloaded, 60fps is completely fine (183 MB/s, zero drops, p99 ~21ms). The
 * ceiling exists purely because the unloaded case isn't the one that hurts
 * users — capturing a game is exactly when the machine is under load.
 *
 * Raise this only once main throttles on renderer acknowledgement rather than
 * firing frames blindly.
 */
export const NATIVE_CAPTURE_FPS_CEILING = 60;

/**
 * Renderer-side capability probe.
 *
 * `MediaStreamTrackGenerator` is the piece most likely to disappear: upstream
 * Chromium is migrating Breakout Box to a worker-only `VideoTrackGenerator`,
 * and the main-thread constructor is on borrowed time. Verified present in
 * Electron 41.2.1 (Chromium 146), but we feature-detect rather than assume so
 * a future Electron bump degrades to getDisplayMedia instead of breaking
 * screenshare outright.
 */
let cachedRendererSupport: boolean | null = null;
function rendererSupportsNativeVideo(): boolean {
  if (cachedRendererSupport !== null) return cachedRendererSupport;
  const g = globalThis as any;
  cachedRendererSupport =
    typeof g.MediaStreamTrackGenerator === "function" &&
    typeof g.VideoFrame === "function";
  if (!cachedRendererSupport) {
    console.debug("[NativeWindowVideo] renderer lacks MediaStreamTrackGenerator/VideoFrame — using getDisplayMedia");
  }
  return cachedRendererSupport;
}

/**
 * Cheap synchronous pre-check so callers can decide whether it's even worth
 * awaiting the async availability round-trip. Does NOT prove the addon loaded.
 */
export function couldUseNativeWindowVideo(sourceId: string | null | undefined): boolean {
  if (typeof sourceId !== "string" || !sourceId.startsWith("window:")) return false;
  const api = (window as any).electronAPI;
  if (!api?.startWindowCapture || !api?.onWindowVideoFrame) return false;
  return rendererSupportsNativeVideo();
}

export async function startNativeWindowVideoStream(
  sourceId: string,
  opts: NativeWindowVideoOptions = {}
): Promise<NativeWindowVideoHandle> {
  const { maxFps = NATIVE_CAPTURE_FPS_CEILING, firstFrameTimeoutMs = 1500 } = opts;

  // ---- Gate 1: source kind ------------------------------------------------
  // WGC here is CreateForWindow only. "screen:" sources have no HWND to bind,
  // so full-display shares stay on getDisplayMedia.
  if (typeof sourceId !== "string" || !sourceId.startsWith("window:")) return NONE;

  // ---- Gate 2: preload surface -------------------------------------------
  // Non-Electron (web build) or an older preload that predates these channels.
  const api = (window as any).electronAPI;
  if (!api?.startWindowCapture || !api?.onWindowVideoFrame) {
    console.debug("[NativeWindowVideo] electronAPI.startWindowCapture not exposed — using getDisplayMedia");
    return NONE;
  }

  // ---- Gate 3: renderer WebCodecs APIs ------------------------------------
  if (!rendererSupportsNativeVideo()) return NONE;

  // ---- Gate 4: main-process addon --------------------------------------------
  // Covers: non-Windows, missing prebuild, `require()` threw, and Windows
  // builds older than WGC (GraphicsCaptureSession::IsSupported() === false).
  try {
    const available = await Promise.race([
      api.isWindowVideoCaptureAvailable(),
      new Promise((res) => setTimeout(() => res(false), 1000)),
    ]);
    if (!available) {
      console.debug("[NativeWindowVideo] native addon unavailable in main — using getDisplayMedia");
      return NONE;
    }
  } catch {
    return NONE;
  }

  // ---- Start capture ------------------------------------------------------
  let result: any;
  try {
    // maxFps is enforced in the main process before webContents.send, so
    // capped frames never cross the process boundary at all.
    result = await Promise.race([
      api.startWindowCapture(sourceId, maxFps),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000)),
    ]);
  } catch (e: any) {
    console.debug("[NativeWindowVideo] start timed out/threw — using getDisplayMedia:", e?.message || e);
    return NONE;
  }
  if (!result?.ok) {
    console.debug("[NativeWindowVideo] start refused — using getDisplayMedia:", result?.error);
    return NONE;
  }

  // ---- Wire frames into a MediaStreamTrackGenerator ------------------------
  const G = globalThis as any;
  const generator = new G.MediaStreamTrackGenerator({ kind: "video" });
  const writer = generator.writable.getWriter();

  const t0 = performance.now();
  let firstFrameSeen = false;
  let signalFirstFrame: (ok: boolean) => void = () => {};
  const firstFramePromise = new Promise<boolean>((res) => { signalFirstFrame = res; });

  // Newest-wins guard against a slow writable.
  //
  // MEASURED CAVEAT: this does not, in practice, protect against encoder
  // overload. MediaStreamTrackGenerator's writable resolves as soon as the
  // frame is handed to the track sink; it does NOT propagate backpressure from
  // a downstream WebRTC encoder. Benchmarked at 1080p60 with a real VP9 and
  // H264 encoder in the loop, write() resolved in p50 0ms / p95 0.1ms and this
  // branch fired exactly 0 times out of 3600 frames on both codecs.
  //
  // WebRTC absorbs overload itself instead, by downscaling resolution and
  // dropping frames internally (qualityLimitationReason). So this is cheap
  // insurance for a writable that blocks for some other reason, not the
  // encoder-overload protection it was originally written as.
  // NOTE: no fps gate here — pacing moved into the main process (see
  // electron/framePacer.cjs) so dropped frames never pay the IPC cost.
  // Frames arriving in this callback are already at the target rate.
  let writeInFlight = false;

  let received = 0;
  let written = 0;
  let droppedBackpressure = 0;
  let bytesReceived = 0;
  const endToEndUs: number[] = [];

  const unsubscribe = api.onWindowVideoFrame((frame: any) => {
    const acknowledge = () => {
      if (frame?.frameId != null) api.ackWindowVideoFrame?.(frame.frameId);
    };
    try {
      if (generator.readyState !== "live") { acknowledge(); return; }
      const now = performance.now();
      received++;
      bytesReceived += frame?.data?.byteLength || frame?.data?.length || 0;

      if (writeInFlight) { droppedBackpressure++; acknowledge(); return; }

      const data: Uint8Array =
        frame?.data instanceof Uint8Array ? frame.data : new Uint8Array(frame?.data || []);
      const width = frame?.width | 0;
      const height = frame?.height | 0;
      if (!width || !height || data.byteLength === 0) { acknowledge(); return; }

      const vf = new G.VideoFrame(data, {
        format: "NV12",
        codedWidth: width,
        codedHeight: height,
        // VideoFrame timestamps are microseconds and must increase monotonically.
        timestamp: Math.round((now - t0) * 1000),
      });

      writeInFlight = true;

      writer
        .write(vf)
        .then(() => {
          written++;
          // Native stamp and this clock share the Unix epoch, so the delta is
          // the true FrameArrived -> track-write latency across processes.
          if (frame?.captureTimeUs) {
            const nowUs = (performance.timeOrigin + performance.now()) * 1000;
            endToEndUs.push(nowUs - frame.captureTimeUs);
          }
        })
        .catch(() => { /* generator closed mid-write; teardown handles it */ })
        .finally(() => {
          writeInFlight = false;
          acknowledge();
          // Writing transfers ownership, but close() is idempotent and this
          // guarantees we never leak a frame if the write rejected.
          try { vf.close(); } catch {}
        });

      if (!firstFrameSeen) {
        firstFrameSeen = true;
        console.log(`[NativeWindowVideo] first frame ${width}x${height} in ${(now - t0).toFixed(0)}ms`);
        signalFirstFrame(true);
      }
    } catch (e) {
      acknowledge();
      console.debug("[NativeWindowVideo] frame decode failed:", e);
    }
  });

  const getStats = (): NativeWindowVideoStats => {
    const sorted = [...endToEndUs].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0;
    return {
      elapsedMs: performance.now() - t0,
      received,
      written,
      droppedBackpressure,
      bytesReceived,
      endToEndUs: { p50: pct(0.5), p95: pct(0.95), max: sorted[sorted.length - 1] || 0 },
    };
  };

  const stop = () => {
    try { unsubscribe?.(); } catch {}
    try { api.stopWindowCapture?.(); } catch {}
    try { writer.close(); } catch {}
    try { generator.stop(); } catch {}
    const s = getStats();
    console.debug(
      `[NativeWindowVideo] stopped — received=${s.received} written=${s.written} ` +
      `dropBP=${s.droppedBackpressure}`
    );
  };

  // ---- Gate 5: the black-screen guard -------------------------------------
  // Everything above can report success and still yield a track that never
  // produces pixels — a protected/DRM window, a window that closed between
  // pick and start, or a GPU that refuses the capture. Handing that track to
  // WebRTC means the viewer sees a permanent black rectangle, which is far
  // worse than not using the native path at all. So we only commit once a
  // real frame has actually landed; otherwise tear down and fall back.
  const gotFrame = await Promise.race([
    firstFramePromise,
    new Promise<boolean>((res) => setTimeout(() => res(false), firstFrameTimeoutMs)),
  ]);

  if (!gotFrame) {
    console.debug(`[NativeWindowVideo] no frame within ${firstFrameTimeoutMs}ms — using getDisplayMedia`);
    stop();
    return NONE;
  }

  return { videoTrack: generator as MediaStreamTrack, stop, getStats };
}
