

## Six fixes for v0.2.13

### 1. Window screenshare audio — root cause found
`HRESULT 0x88890021` = `AUDCLNT_E_UNSUPPORTED_FORMAT`. Process loopback (`AUDCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK`) does **not** accept a hand-rolled `WAVEFORMATEX` with `WAVE_FORMAT_IEEE_FLOAT`. Microsoft's official sample uses **`WAVE_FORMAT_PCM` 16-bit stereo 44100Hz** — that's literally the only format combo the loopback engine accepts.

Fix in `native/win-audio-capture/src/process_loopback_capture.cc`:
- Switch `WAVEFORMATEX` to `wFormatTag=WAVE_FORMAT_PCM`, `wBitsPerSample=16`, `nChannels=2`, `nSamplesPerSec=44100`.
- Update `format_.bitsPerSample=16`, `floatPcm=false`, `sampleRate=44100`.
- In `src/lib/nativeWindowAudio.ts`, decode incoming PCM as `Int16Array` → convert to `Float32` (`/ 32768`) before pushing into the AudioBuffer, and use the negotiated sample rate.

### 2. Camera tile stays black when peer turns camera off (screenshot bug)
In `VoiceCallOverlay.tsx` line 295, gate the `<video>` tile on **both** `remoteVideoStream` *and* `peerState?.is_video_on`. When the peer toggles camera off, fall back to the avatar circle (same branch as no-stream).

### 3. Clickable links + URL preview cards in chat
- New `src/lib/linkify.tsx`: split message text on a URL regex, render plain text + `<a>` tags (`target=_blank`, security rels, accent color, hover underline).
- New `src/components/app/chat/LinkPreview.tsx`: lightweight OG-card. Calls a new edge function `link-preview` that fetches the URL server-side and parses `<title>`, `og:title`, `og:description`, `og:image` (avoids CORS, hides user IP). Cached in-memory by URL for the session.
- Use linkify wherever `text` from `parseContent(msg.content)` is rendered. Show up to 1 preview card per message under the bubble.

### 4. Built-in video player for mp4/mov/webm attachments
Extend `AttachmentItem.tsx` with a third branch when `attachment.type.startsWith("video/")`:
- Render a Cubbly-styled `<video controls preload="metadata" playsInline>` capped at `max-h-[360px]` with rounded corners matching image attachments.
- Click thumbnail → opens existing-style fullscreen lightbox (new `VideoLightbox.tsx` mirroring `ImageLightbox`) with custom dark controls.

### 5. Multi-line auto-growing message box + 1000 char limit + counter
In `ChatView.tsx`:
- Replace the `<input type="text">` (line 674) with a `<textarea>` that auto-grows to ~6 lines then scrolls. Use a small `useAutoGrowTextarea(ref)` hook that resets `height: auto` then `scrollHeight` on every change.
- Enforce `maxLength={1000}` and hard-truncate on paste.
- Render counter `{input.length}/1000` in the bottom-right corner of the input row, only when `input.length >= 750`. Color shifts: secondary → orange at 900 → red at 1000.
- `Enter` sends, `Shift+Enter` newlines. Update all refs from `HTMLInputElement` → `HTMLTextAreaElement` (focus calls, `useTypeToFocus`).

### 6. iOS PWA loading animation
The webm autoplay in `LoadingSplash.tsx` is silently rejected on iOS Safari/standalone PWA on first paint (no user gesture, codec quirks). Fix:
- Detect iOS standalone (`navigator.standalone === true || display-mode: standalone` + iOS UA).
- On iOS, replace the `<video>` with an animated CSS/SVG fallback (same warm tone, gentle pulsing/breathing logo) so the splash never appears frozen.
- Keep the webm path for everything else.

### Files touched
- `native/win-audio-capture/src/process_loopback_capture.cc`
- `src/lib/nativeWindowAudio.ts`
- `src/components/app/VoiceCallOverlay.tsx`
- `src/components/app/ChatView.tsx`
- `src/components/app/chat/AttachmentItem.tsx` + new `VideoLightbox.tsx`
- `src/lib/linkify.tsx` (new) + `src/components/app/chat/LinkPreview.tsx` (new)
- `supabase/functions/link-preview/index.ts` (new edge function)
- `src/components/app/LoadingSplash.tsx`
- `package.json` + `src/lib/changelog.ts` → bump to **v0.2.13**

### Release rule
Native addon source changed → workflow must rebuild prebuilds. Confirm the GH Actions `prebuild-native.yml` runs on push (it does). Then your existing `git pull && set BUILD_TARGET=electron && npm run build:electron && npx electron-builder --win nsis --x64 --publish always` ships it.

