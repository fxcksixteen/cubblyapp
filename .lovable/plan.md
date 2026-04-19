
Goal: fix the two issues that are still real in the shipped desktop app:
1) old chat attachments are still requesting expired signed URLs and throwing 400s
2) per-window screenshare audio still fails with `IAudioClient::Initialize failed: HRESULT 0x88890021`

What I found:
- The attachment system still stores short-lived signed URLs inside message content in `src/components/app/ChatView.tsx`. That means old messages permanently carry expired URLs.
- `src/components/app/chat/AttachmentItem.tsx` tries to re-sign on mount, but it initializes `<img>/<video>/<a>` with the stale URL first, so the app still fires failing GETs before the refresh finishes. That matches the 400 spam you pasted.
- The native audio addon in `native/win-audio-capture/src/process_loopback_capture.cc` is still forcing one exact format (`44.1kHz`, stereo, `WAVE_FORMAT_IEEE_FLOAT`) instead of negotiating from the activated client/device. That is the most likely cause of `0x88890021`.
- Your desktop screenshot still shows `Cubbly v0.2.7`, while the repo now says `0.2.15`. So the installed build is stale or at least not proving the packaged renderer/native binary matches current source. Until that is fixed, even good code can look “not fixed”.
- There are also unrelated devtools/runtime problems still active:
  - service worker registration is running under `file://` in Electron
  - several realtime subscriptions call `.subscribe()` too early, then add `postgres_changes` listeners after
  - one context-menu component is triggering a ref warning

Do I know what the issue is?
Yes:
- Attachments: wrong persistence model + stale URL rendered before refresh.
- Window audio: fragile WASAPI initialization strategy, plus no hard proof the packaged app is actually the latest build.

Implementation plan:
1. Fix attachment persistence at the source
- Change message attachment metadata to store stable storage object info instead of signed URLs.
- Store something like:
  - `name`
  - `path`
  - `size`
  - `type`
  - optional legacy `url` only for backward compatibility
- Update upload logic in `src/components/app/ChatView.tsx` so new messages save object paths, not 1-hour signed URLs.

2. Make attachment rendering backward-compatible and stop the 400 spam
- Update `src/components/app/chat/AttachmentItem.tsx` to:
  - prefer `attachment.path`
  - fall back to extracting a path from old signed URLs for legacy messages
  - wait for a fresh signed URL before rendering media/download links
  - avoid ever mounting `<img>` / `<video>` with an expired URL first
- Add a tiny loading/file-placeholder state while re-signing.
- Ensure image, video, and file download all use the freshly generated URL.

3. Audit storage access rules for private attachments
- Verify the backend policies for the `chat-attachments` bucket support upload + signed URL generation for conversation members.
- If missing or too loose, add a migration to tighten/fix them without breaking existing files.

4. Replace the native WASAPI format hack with proper negotiation
- Rework `native/win-audio-capture/src/process_loopback_capture.cc` to stop hardcoding one format.
- Use the activated audio client’s supported/mix format path, then initialize with the format Windows actually accepts for process loopback.
- Keep the same JS-facing output contract so `src/lib/nativeWindowAudio.ts` stays compatible.
- Preserve the current per-process PID resolution flow in `electron/main.cjs`, but improve native error reporting so failures say exactly which negotiation step failed.

5. Make the shipped app prove its real version
- Expose the desktop app version from Electron main/preload using `app.getVersion()`.
- Show/log the packaged desktop version from Electron rather than only the renderer changelog constant.
- Keep the changelog version in sync, but make stale packaged builds obvious immediately.
- This prevents another “repo says 0.2.15 but installed app says 0.2.7” situation.

6. Remove Electron-only devtools noise
- Disable service worker registration when running inside Electron / `file://`.
- That should remove the packaged-app SW error from devtools.

7. Fix the realtime runtime errors
- Update the affected files so all `.on("postgres_changes", ...)` handlers are attached before `.subscribe()`:
  - `src/hooks/useUnreadCounts.ts`
  - `src/contexts/ActivityContext.tsx`
  - `src/contexts/VoiceContext.tsx`
  - `src/contexts/AuthContext.tsx`
- This should eliminate the repeated realtime channel errors.

8. Fix the context-menu ref warning
- Review `src/components/ui/context-menu.tsx` and any caller passing custom components into Radix slots/content.
- Patch the ref forwarding chain so `ContextMenuContent` stops warning in devtools.

Validation after implementation:
- Old image/video/file attachments open without any 400 requests in devtools.
- New attachments persist across refresh/relogin because they are path-based, not URL-based.
- Window-only screenshare audio starts without `0x88890021`.
- Packaged app devtools shows the correct desktop version, not `v0.2.7`.
- Electron no longer logs service worker registration errors.
- Realtime subscription errors are gone.
- End-to-end test:
  - send attachments
  - reload and reopen old messages
  - start a 1-on-1 call
  - share a single app window with audio
  - verify remote user hears only that app’s audio

Files likely involved:
- `src/components/app/ChatView.tsx`
- `src/components/app/chat/AttachmentItem.tsx`
- `src/lib/nativeWindowAudio.ts`
- `native/win-audio-capture/src/process_loopback_capture.cc`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/main.tsx`
- `src/hooks/useUnreadCounts.ts`
- `src/contexts/ActivityContext.tsx`
- `src/contexts/VoiceContext.tsx`
- `src/contexts/AuthContext.tsx`
- `src/components/ui/context-menu.tsx`
- backend migration(s) for storage policies if needed

Because I’m in read-only mode, I can’t apply the fixes yet. Once you approve, I’ll switch to implementation mode and patch all of this in one pass.
