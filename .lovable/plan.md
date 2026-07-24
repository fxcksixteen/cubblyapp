# v0.4.13 "GPU Unlock" — Discord-parity screenshare

Goal: pull every lever a same-stack Electron app can pull (Chromium flags, WebRTC codec selection, capture pipeline, and a native Windows capture module) so screenshare uses the GPU end-to-end and matches or beats Discord — regardless of the user's "hardware acceleration" setting.

---

## 1. Force GPU acceleration on, always

In `electron/main.cjs`, before `app.ready`:

- **Remove the honor-`hardwareAcceleration=false` branch** — screenshare needs GPU, so the shell always runs accelerated. (The in-app toggle stays visible but is repurposed as a renderer-only hint that no longer disables Chromium's GPU process.)
- Add the Discord-equivalent Chromium switch set:
  - `enable-gpu-rasterization`
  - `enable-zero-copy`
  - `enable-accelerated-video-decode`
  - `enable-accelerated-video-encode` (currently disabled by default in Electron)
  - `ignore-gpu-blocklist` (matches Discord — bypasses Chromium's conservative driver blocklist so older/less common GPUs still get HW encode)
  - `enable-features=VaapiVideoEncoder,VaapiVideoDecoder,PlatformHEVCEncoderSupport,CanvasOopRasterization` on Linux/Mac; `MediaFoundationH264Encoding,MediaFoundationVP9Encoding` on Windows
  - `disable-features=UseChromeOSDirectVideoDecoder` (avoids a known GPU-encode regression path)
  - `use-angle=d3d11` on Windows for the ANGLE backend Discord uses
- Add an `app.on("gpu-info-update")` diagnostic that logs the active video encoder (NVENC / QuickSync / VideoToolbox / AMF / VAAPI / software) at startup, and expose it to the renderer via IPC.

## 2. Prefer hardware-friendly codecs in the SDP

In `src/contexts/VoiceContext.tsx` `preferScreenShareCodec`:

- Change ranking to match Discord's real behavior for screenshare:
  1. **H.264** first when a hardware encoder is present (NVENC/QuickSync/VideoToolbox/AMF all encode H.264 natively — this is what Discord actually ships on desktop)
  2. VP9 second (universal HW decode, good SW fallback)
  3. VP8 third
  4. AV1 last (SW only in current Chromium — kept last)
- Query the encoder info from step 1's IPC. When no HW encoder is detected, fall back to VP9-first (current behavior).
- Log the actual chosen codec + whether the encoder is hardware (surfaced in `CallDiagnosticsModal`).

## 3. GPU-path capture (`desktopCapturer` + constraints)

In `electron/main.cjs` display-media handler and `src/contexts/VoiceContext.tsx` / `GroupCallContext.tsx` capture calls:

- Pass `{ types: ["screen","window"], fetchWindowIcons: false, thumbnailSize: { width: 0, height: 0 } }` to `desktopCapturer.getSources` — zero-thumbnail avoids a CPU BitBlt on every enumeration.
- Add the `chromeMediaSourceId` constraint pattern that keeps capture on the GPU texture path:
  - `mandatory.chromeMediaSource: "desktop"`
  - `mandatory.chromeMediaSourceId: sourceId`
  - No `mandatory.maxWidth/maxHeight` (those force a CPU rescale). Downscaling stays in the encoder via `scaleResolutionDownBy` (already in `screenShareEncoding.ts`).
- Request `contentHint = "motion"` on the track (already done in the encoder controller — verify it's set before the first frame, not after).

## 4. Native Windows capture module (the "last 10%")

Add `native/win-screen-capture/` — a small N-API addon that uses DXGI Desktop Duplication + a shared D3D11 texture, exposed as a `MediaStreamTrack` via `electron`'s WebFrameMain texture-sharing path.

- Prebuild with `prebuildify` (same pattern as the existing `native/win-audio-capture`).
- Feature-detected at runtime: if the `.node` binary loads, use it; otherwise fall back to `desktopCapturer` (current path).
- Wire it behind an IPC handler `cubbly:capture-window-dxgi` returning a token that `getDisplayMedia` resolves via a custom `setDisplayMediaRequestHandler` branch.
- Non-blocking for the release: the JS-side plumbing lands in v0.4.13; if the prebuild isn't ready by ship time, it silently falls back to standard capture and ships in the next patch. The other 3 sections do 90% of the work by themselves.

## 5. Diagnostics + verification

- Extend `CallDiagnosticsModal.tsx` with a "GPU Pipeline" section showing:
  - Chromium GPU process status
  - Active video encoder + whether it's HW-accelerated
  - Capture path (DXGI native / desktopCapturer)
  - Actual codec negotiated for the share
- Add a startup log line summarizing the same, so users can paste it when reporting issues.

## 6. Settings-panel copy update

`AdvancedSettings.tsx`: change the "Hardware acceleration" toggle description to clarify it only affects renderer UI compositing; screenshare and video always use the GPU. Add a warning if the GPU process failed to start (rare — driver crash).

## 7. Version + changelog

- `package.json` and `src/lib/changelog.ts`: keep `0.4.13`. Append entry:
  - "Screenshare rebuilt to match Discord — hardware H.264/VP9 encoding, GPU-path capture, always uses your GPU even if hardware acceleration is off in settings."

---

## Technical notes

- **Why H.264 first for HW**: NVENC, QuickSync, VideoToolbox and AMF all ship H.264 encoders in silicon on essentially every consumer GPU from the last decade, including your RTX 4060 Ti (NVENC 8th-gen). Chromium's `MediaFoundationH264Encoding` flag on Windows routes libwebrtc through the MFT that talks directly to NVENC. VP9 hardware encode is NVIDIA-40-series-only on the consumer side, so H.264 is the safer universal HW path — this is why Discord defaults to H.264 for screenshare and only uses VP9 for opt-in "smoother video" mode on capable GPUs.
- **Why the toggle can safely be ignored for screenshare**: `app.disableHardwareAcceleration()` disables the whole GPU process, which kills HW encode, HW decode, GPU raster, and canvas OOP-raster in one shot. There is no per-feature knob in Chromium. The only correct answer if we want Discord parity is to keep the GPU process on and route around it in the renderer only where users actually see problems (CSS animations — which we already documented in the settings warning).
- **AV1**: staying last. Chromium's AV1 encode is still SVT-AV1 in software; enabling it on a machine with HW accel off is exactly the "unplayable stream" case the user reported in v0.4.11.
- **DXGI native module risk**: the addon is optional and feature-detected. If prebuild slips, everything else in the patch still lands and works — Discord ran on pure `desktopCapturer` for years before adding their native path.

## Files touched

- `electron/main.cjs` — flags, remove HW-accel disable branch, GPU info IPC, capture handler tweaks
- `src/contexts/VoiceContext.tsx` — codec ranking, capture constraints, diagnostics
- `src/contexts/GroupCallContext.tsx` — capture constraints
- `src/lib/screenShareEncoding.ts` — ensure `contentHint` set pre-first-frame
- `src/components/app/CallDiagnosticsModal.tsx` — GPU pipeline section
- `src/components/app/AdvancedSettings.tsx` — updated copy
- `src/lib/changelog.ts`, `package.json` — changelog entry
- `native/win-screen-capture/` — new optional addon (feature-detected)
