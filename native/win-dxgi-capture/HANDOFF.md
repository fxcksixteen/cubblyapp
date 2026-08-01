# win-dxgi-capture — handoff

Native Windows Graphics Capture (WGC) window capture for Cubbly screenshare,
replacing `getDisplayMedia` for `window:` sources on Windows.

Status: **working and shipped-ready, capped at 30fps.**

---

## NEXT PIECE OF WORK

**Main-side throttling on renderer acknowledgement.** This is the single change
that unlocks 60fps.

Today `electron/main.cjs` calls `webContents.send("window-video-frame", frame)`
for every paced frame with no regard for whether the renderer is draining them.
There is no flow control anywhere in the pipeline. When the renderer is starved,
the IPC queue grows without bound (measured below: 20+ second latency).

The fix: have the renderer acknowledge frames, and have main drop new frames
while more than N (probably 1-2) are un-acked, instead of firing blindly.
Once that exists, raise `NATIVE_CAPTURE_FPS_CEILING` in
`src/lib/nativeWindowVideo.ts` and re-run the CPU-contention measurement.

---

## DO NOT REGENERATE

These files are hand-written and empirically verified against real hardware.
They encode measured behaviour and Windows-specific COM/WinRT constraints that
are **not** inferable from reading the code, and that no codegen tool will
reproduce. This applies to AI coding assistants as much as to humans.

- `native/win-dxgi-capture/**` — all of it (binding.gyp, src/*.cc, src/*.h, index.js)
- `package.json` → the `build.files` and `build.asarUnpack` entries for `native/win-dxgi-capture`
- `electron/main.cjs` → the `winvideo` addon loader, `parseHwndFromSourceId`, and the `start-window-capture` / `stop-window-capture` / `is-window-video-capture-available` / `get-window-video-capture-stats` handlers
- `electron/preload.cjs` → the `startWindowCapture` / `stopWindowCapture` / `isWindowVideoCaptureAvailable` / `onWindowVideoFrame` / `getWindowVideoCaptureStats` bridge entries
- `src/lib/nativeWindowVideo.ts`
- `electron/framePacer.cjs`

**Failure mode if regenerated: silent.** Native capture stops working and the
app falls back to `getDisplayMedia` with no error, no toast, no console
exception — by design (see "Fallback" below). Screenshare keeps working, just
worse. Nobody notices until someone measures it. If you change any of these,
you must re-run the verification in "How to verify" — not just check that the
app builds.

---

## What it does

Captures a single window by `HWND` using Windows Graphics Capture, converts
BGRA → NV12 on the CPU, and delivers frames to the renderer, which feeds them
into a `MediaStreamTrackGenerator` and uses that track for WebRTC screenshare
in place of `getDisplayMedia`.

Only `window:` sources. `screen:` sources still go through `getDisplayMedia` —
WGC here uses `CreateForWindow`, and a monitor has no `HWND` to bind.

Frame shape delivered to JS:

```js
{ data: Buffer,        // NV12: Y plane (w*h), then interleaved UV (ceil(w/2)*ceil(h/2)*2)
  width: number,
  height: number,
  captureTimeUs: number }  // epoch microseconds, stamped at WGC FrameArrived
```

`captureTimeUs` uses `std::chrono::system_clock` (NOT `steady_clock`) on
purpose: it shares an epoch with `performance.timeOrigin + performance.now()`
in **both** the main and renderer processes, which is the only reason
cross-process latency is measurable at all. Do not "fix" this to steady_clock.

---

## Wiring

```
WGC FrameArrived (WinRT threadpool thread)
  └─ window_capture.cc  → BGRA→NV12 → FrameCallback
      └─ addon.cc        → Napi::ThreadSafeFunction → main-process JS
          └─ main.cjs    → framePacer.shouldEmit()  ← fps cap applied HERE
              └─ webContents.send("window-video-frame")   ← NO FLOW CONTROL
                  └─ preload.cjs  onWindowVideoFrame  (contextBridge, deep-clones)
                      └─ nativeWindowVideo.ts → new VideoFrame(NV12)
                          └─ MediaStreamTrackGenerator.writable.write()
                              └─ track → RTCPeerConnection (WebRTC encodes)
```

**IPC channels** (`electron/main.cjs` ↔ `electron/preload.cjs`):

| Channel | Direction | Purpose |
|---|---|---|
| `is-window-video-capture-available` | invoke | addon loaded AND `GraphicsCaptureSession::IsSupported()` |
| `start-window-capture` | invoke `(sourceId, maxFps)` | begins capture, returns `{ok, handle}` or `{ok:false, error}` |
| `stop-window-capture` | invoke | stops, logs session totals |
| `window-video-frame` | main → renderer | one NV12 frame |
| `get-window-video-capture-stats` | invoke | throughput/latency/memory counters |

**`sourceId` parsing:** Electron formats window sources as `window:<hwnd>:<n>`.
`parseHwndFromSourceId()` in `main.cjs` extracts the HWND, trying decimal then
hex — mirroring the existing `resolveSourcePid()` used by win-audio-capture.
The HWND is used directly; it is NOT resolved to a PID (WGC binds to the
window, not the process — that's the opposite of the audio module).

**Renderer entry points** (`src/lib/nativeWindowVideo.ts`):

- `couldUseNativeWindowVideo(sourceId)` — cheap sync pre-check
- `startNativeWindowVideoStream(sourceId, { maxFps, firstFrameTimeoutMs })`
- `NATIVE_CAPTURE_FPS_CEILING` — hard cap, currently `30`

Call sites: `src/contexts/VoiceContext.tsx` (1:1 calls) and
`src/contexts/GroupCallContext.tsx` (group calls). Both are attempted
**before** `getDisplayMedia`, so only one capture ever runs.

---

## Fallback (why failures are invisible)

`getDisplayMedia` already works everywhere; native capture is a pure upgrade.
So every failure returns `{ videoTrack: null, stop: () => {} }` and the caller
silently proceeds with `getDisplayMedia`. Nothing throws, nothing is surfaced.
This is deliberate and differs from `nativeWindowAudio.ts`, which *does* raise
`cubbly-winaudio-error` because there is no audio fallback.

Five gates, all silent:

1. **Source kind** — must be `window:`
2. **Preload surface** — absent on web builds and older preloads
3. **Renderer WebCodecs** — `MediaStreamTrackGenerator` + `VideoFrame` must exist
4. **Main-process addon** — covers non-Windows, missing prebuild, `require()` throwing, and pre-WGC Windows
5. **First frame actually arrives** (1.5s timeout)

Gate 5 is the one people delete because it "looks redundant". It is not.
Gates 1-4 can all pass and still yield a track that never produces pixels —
DRM/protected windows, a window closed between pick and start, a GPU refusing
capture. That track goes to WebRTC and the viewer sees a **permanent black
rectangle**, which is strictly worse than not using the native path. The track
is only returned once a real frame has landed.

Gate 3 matters more than it looks: upstream Chromium is migrating Breakout Box
to a **worker-only `VideoTrackGenerator`**. Main-thread
`MediaStreamTrackGenerator` exists in Electron 41 (Chromium 146) and is
verified working, but it is on borrowed time. Feature-detected so a future
Electron bump degrades to `getDisplayMedia` instead of breaking screenshare.

---

## Three non-obvious implementation decisions

### 1. `Direct3D11CaptureFramePool::CreateFreeThreaded`, not `Create`

`Create()` marshals `FrameArrived` through a `DispatcherQueue` on the calling
thread. **Electron's main process does not pump a WinRT DispatcherQueue**, so
with `Create()` the callback never fires — capture appears to start
successfully and then delivers nothing, forever. `CreateFreeThreaded` delivers
on an arbitrary MTA threadpool thread instead.

This also interacts with the STA issue below: `CreateFreeThreaded` works from
an STA precisely because it needs no DispatcherQueue from the caller.

### 2. Frame pool `Recreate()` on content-size change

If the captured window resizes and the pool is not recreated to match, you get
stretched or garbage frames. `OnFrameArrived` compares `frame.ContentSize()`
against `lastSize_` and calls `framePool_.Recreate(...)`, then returns — the
*next* `FrameArrived` delivers at the new size.

Verified live: capturing Notepad and calling `MoveWindow` mid-capture, frames
switched cleanly 1430x784 → 890x495 and kept streaming.

### 3. Deadlock-free `Stop()`

`FrameArrived` runs on a WinRT threadpool thread while `Stop()` is called from
the JS thread. `revoker.revoke()` **blocks until any in-flight handler
returns.**

So `Stop()` clears the atomic `running_` flag, then revokes **without holding
`mutex_`**, and only takes `mutex_` afterwards for teardown. `OnFrameArrived`'s
very first action is checking `running_`, so it bails before touching the mutex.
Holding `mutex_` across `revoke()` deadlocks against a handler blocked on that
same mutex.

If you refactor `Stop()`, preserve this ordering: **clear flag → revoke unlocked
→ lock → tear down.**

---

## The STA apartment crash (read before writing any verification)

`winrt::init_apartment(apartment_type::multi_threaded)` throws
`RPC_E_CHANGED_MODE` when the calling thread is already an STA. **Chromium
makes Electron's main thread an STA before any addon loads.** The module is
built with `NAPI_DISABLE_CPP_EXCEPTIONS`, so that exception escaped N-API and
**hard-killed the main process** on the first `isSupported()` call.

`src/win_rt_util.h` now treats `RPC_E_CHANGED_MODE` as success (COM is usable
either way) and is `noexcept`. `Start()` has a catch-all, and `OnFrameArrived`
swallows everything — it runs on a WinRT threadpool thread where an escaping
exception unwinds into WinRT's event dispatch and terminates the process. A
dropped frame always beats a dead app.

### Why this was missed, and the rule that follows

The bug survived initial verification because those tests ran with
`ELECTRON_RUN_AS_NODE=1`. That mode starts Electron's **Node runtime without
Chromium** — no pre-existing apartment, so the MTA request succeeded. The test
proved the addon compiles, links, and loads. It never exercised the real main
process.

> **RULE: any verification of this module must run a real Electron main process
> (a real `BrowserWindow` app), not `ELECTRON_RUN_AS_NODE=1`.**
> `ELECTRON_RUN_AS_NODE` is valid for checking that the `.node` links and
> exports symbols, and for nothing else. State explicitly what a test did and
> did not exercise.

---

## Why `maxFps` is capped at 30

`NATIVE_CAPTURE_FPS_CEILING = 30` in `src/lib/nativeWindowVideo.ts`.
Callers bind to the user's configured screenshare fps, then clamp to this.

**Unloaded, 60fps is completely fine** — 1080p60 sustains 183 MB/s over IPC
with 3600/3600 frames written, zero drops, p99 latency ~19-21ms, through the
real `contextBridge` boundary and with a real encoder attached.

**Under CPU contention it collapses.** Measured at 1080p, VP9, 50 Mbps ceiling
(so bandwidth was not the limiter), 12 busy-loop workers on 8 cores:

| | 60fps | 30fps |
|---|---|---|
| Frames sent by main | 8046 | 1806 |
| Frames received by renderer | **5294** (~2750 stuck in IPC) | **1803** (queue empty) |
| End-to-end latency p50 | **20,214 ms** | **81 ms** |
| End-to-end latency p99 | **46,180 ms** | **721 ms** |
| Wall clock for a 60s test timer | **136.9 s** | 61.8 s |
| Backpressure drops | 0 | 0 |

Twenty seconds of p50 latency. The cause is the missing flow control described
at the top: main keeps sending at full rate into an IPC queue the starved
renderer cannot drain.

The unloaded case is not the one that matters — **capturing a game is exactly
when the machine is under load.**

> **Condition for raising the ceiling: main must throttle on renderer
> acknowledgement first.** Raising it without that reintroduces multi-second
> latency on precisely the machines this feature exists to serve.

Note: this test never produced `qualityLimitationReason: cpu`. Under CPU
starvation the bottleneck lands upstream of the encoder, so WebRTC's
encoder-side limitation signal never trips (it reported `none`). The encoder
was never shown to be the constraint.

---

## The backpressure guard cannot fire

`nativeWindowVideo.ts` has a `writeInFlight` newest-wins guard. It was written
as encoder-overload protection. **It is structurally unable to do that job.**

`MediaStreamTrackGenerator`'s writable resolves as soon as the frame reaches
the track sink. It does **not** propagate backpressure from a downstream WebRTC
encoder. Measured with a real encoder in the loop at 1080p60:

| | VP9 | H264 |
|---|---|---|
| `writer.write()` wait p50 / p95 | 0 ms / 0.1 ms | 0 ms / 0.1 ms |
| Backpressure drops | **0 / 3600** | **0 / 3600** |
| Frames encoded (of 3600 written) | 2451 | 3475 |
| Encoder output size | 1428x804 | 476x268 |
| `qualityLimitationReason` | bandwidth | bandwidth |

WebRTC absorbs overload internally by downscaling and dropping frames. It
recorded 0 drops in **every** run performed, loaded and unloaded, both codecs.

**The queue that actually forms is upstream of this guard**, in main's
`webContents.send` loop. No renderer-side change can fix it. The guard is kept
as cheap insurance against a writable that blocks for some other reason — do
not delete it, but do not trust it to protect the encoder either.

(The H264 downscale to 476x268 is likely a loopback-BWE artifact and should not
be read as expected production quality. The zero-backpressure finding is
robust; the downscale magnitudes are not.)

---

## Build, CI, packaging

### Local rebuild

```
cd native/win-dxgi-capture
npx node-gyp rebuild --runtime=electron --target=41.2.1 --dist-url=https://electronjs.org/headers
cp build/Release/win_dxgi_capture.node prebuilds/win32-x64/win-dxgi-capture.node
```

`build/`, `node_modules/`, and `package-lock.json` inside this directory are
gitignored. The committed `prebuilds/win32-x64/win-dxgi-capture.node` is what
ships.

### Toolchain requirements

Stricter than win-audio-capture — do not copy that module's flags:

- **`/std:c++20`** (not c++17) — required by C++/WinRT
- **`/EHsc`** and **`/bigobj`** — WinRT headers exceed MSVC's default object
  file section limit without `/bigobj`
- Libraries: `windowsapp.lib`, `d3d11.lib`, `dxgi.lib`, `dxguid.lib`,
  `ole32.lib`, `runtimeobject.lib`
- MSVC 2022 + **Windows SDK 10.0.19041 or newer** (for
  `Windows.Graphics.Capture` headers)
- All Windows code is guarded by `OS=='win'` in `binding.gyp` and `#ifdef
  _WIN32` in sources; `src/addon_stub.cc` is the non-Windows no-op

Two namespace traps that will bite a regeneration: `IDirect3DDxgiInterfaceAccess`
lives in the **global** `::Windows::Graphics::DirectX::Direct3D11` (ABI), not
`winrt::Windows::...`; and a blanket `using winrt::Windows::Foundation::IInspectable`
collides with the raw `::IInspectable` from `<inspectable.h>` pulled in by the
interop headers. Both are used in the same file and must stay fully qualified.
`RPC_E_CHANGED_MODE` needs an explicit `#include <winerror.h>`.

### CI

`.github/workflows/prebuild-dxgi.yml` — mirrors `prebuild-native.yml`
(win-audio-capture). Runs on `windows-2022` (which ships a suitable SDK by
default), Node 20, Python 3.11, MSBuild, then
`prebuildify --napi --strip -t electron@41.0.0 --arch=x64`, and commits the
`.node` back to `native/win-dxgi-capture/prebuilds` on the same branch.

Triggers on `workflow_dispatch` and any push touching
`native/win-dxgi-capture/**`.

N-API is ABI-stable, so one NAPI build covers Electron 33, 41, and beyond;
targeting 41 just avoids header drift.

### Packaging

`package.json` needs BOTH:

- `build.files` → `native/win-dxgi-capture/{index.js,package.json,prebuilds/win32-x64/**/*}`
- `build.asarUnpack` → `native/win-dxgi-capture/**/*`

A `.node` cannot be `dlopen`ed from inside an asar. `asarUnpack` leaves a
metadata stub in the archive (`"unpacked": true`) while the bytes live in
`app.asar.unpacked`. **Removing the `asarUnpack` entry breaks native capture
silently** — the app falls back to `getDisplayMedia`.

Verified on the packaged build: asar header reports
`{"size":195072,"unpacked":true}`; the packaged app logs
`[winvideo] native addon loaded from ...` (a line that only prints when
`isSupported()` returned true); and renaming the `app.asar.unpacked` copy makes
it log `[winvideo] native addon NOT loaded` instead.

---

## How to verify a change

1. Rebuild (above), copy to `prebuilds/`.
2. `npx tsc --noEmit` and `node --check` on the three `.cjs` files.
3. Launch a **real Electron main process** — never `ELECTRON_RUN_AS_NODE=1`
   (see STA section). Confirm `isSupported()` is true and frames arrive.
4. Capture a window that resizes mid-capture; confirm frames switch resolution
   and keep streaming.
5. Call stop; confirm it returns without hanging (deadlock check).
6. If you touched pacing, IPC, or the ceiling: re-run under CPU contention
   (busy-loop workers ≥ 1.5× core count) and check that
   `framesSentOverIpc ≈ framesReceived`. A growing gap is the queue-buildup
   failure, and it shows up as latency, not as an error.
7. If you touched packaging: rebuild the installer and re-run the
   asar-unpacked negative control.

The benchmark harness used for all numbers in this document was scratch code
and was deleted. It ran a `BrowserWindow` with an animated canvas as the
capture target, a second window as consumer, an `RTCPeerConnection` loopback
for the encoder, and `app.getAppMetrics()` for per-process memory. Rebuilding
something equivalent is a few hundred lines.

---

## Known gaps

- **No flow control** main → renderer (the top item)
- **Window sources only** — no monitor capture path
- **No cursor capture toggle** — `GraphicsCaptureSession.IsCursorCaptureEnabled`
  is never set, so the default applies
- **BGRA→NV12 is CPU-side** in `ConvertBgraToNv12`, per-pixel, single-threaded.
  Never profiled in isolation; a GPU shader or SIMD path is the obvious win if
  capture-side CPU ever becomes the bottleneck
- **Fullscreen-exclusive games are not capturable** by WGC window capture at
  all; borderless-windowed works
- **Renderer memory is significant** — ~330MB working set at 1080p60 under VP9
  (vs ~165MB main), plateaus rather than growing, but it is the larger of the
  two processes
- **Never tested against a real game**, only an animated Electron window on an
  otherwise-idle machine
