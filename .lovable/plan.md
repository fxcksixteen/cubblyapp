

## Audit findings

I checked v0.2.9 changes against both code paths. Here's what's actually fixed and what's still broken.

### ✅ Camera visibility (group calls) — FIXED CORRECTLY
`GroupCallContext.tsx` ontrack handler now uses `unmute` instead of `mute` to drive visibility, and only triggers `clearVideoState` on `ended`. Newly negotiated camera tracks that arrive muted-then-unmute will now correctly appear for remote peers. Self-tile already worked (uses local stream directly).

### ✅ 1-on-1 window/tab audio — FIXED CORRECTLY
`VoiceContext.startScreenShare` now:
- Detects window/tab vs screen picks via `sourceId.startsWith("screen:")`.
- Calls `startNativeWindowAudio(sourceId)` only for non-screen picks → uses WASAPI process loopback → adds the resulting MediaStreamTrack to the share stream → applies high-bitrate stereo Opus.
- Resumes AudioContext + sets `audioTrack.enabled = true`.
- Tears down via `nativeWindowAudioStopRef` on `stopScreenShare`.

### ❌ Group call window/tab audio — STILL BROKEN
`GroupCallContext.toggleScreenShare` (lines 872–976) **never calls `startNativeWindowAudio`**. It always passes `wantAudio: true` straight to `setSelectedShareSource`, which means:
- **Window pick** → Electron tries to do Chromium "loopback" on a window source. This produces either no audio track at all, OR (worse) full-system-mix audio leaking everyone else's apps to the group.
- **Screen pick** → works (loopback = full system mix, expected).
- The peer-side ontrack already handles inbound screen audio fine (audio tracks always go to `<audio data-group-peer>` regardless of what video stream id labels them).

### ❌ Browser 1-on-1 tab audio — silently disabled
Line 1544: `allowAudio = effectiveAudio && type === "screen"`. This kills tab audio in non-Electron browsers, even though Chrome supports it for tab + screen surfaces (just not window). Minor, only impacts web users sharing a tab.

---

## Plan: ship v0.2.9 with these fixes

### 1. `GroupCallContext.tsx` — add native per-window audio path

Mirror the 1-on-1 logic in `toggleScreenShare`:

- Detect `isScreenPick = chosenId.startsWith("screen:")`.
- Compute `useChromiumLoopback = wantAudio && isScreenPick`.
- Compute `useNativeWindowAudio = wantAudio && !isScreenPick && (await api.isWindowAudioCaptureAvailable())`.
- Call `setSelectedShareSource(chosenId, useChromiumLoopback)` so Chromium only injects loopback when it's a screen pick.
- After `getDisplayMedia` resolves, if `useNativeWindowAudio`, start the native capture and `stream.addTrack(audioTrack)`.
- Stash the cleanup fn in a new `nativeWindowAudioStopRef` and call it in the off-branch + `leaveCall`.
- Apply high-bitrate stereo Opus (`maxBitrate: 256_000`, `networkPriority: "high"`) to every audio sender pushed into peer PCs — same as the existing `applyHQ(sender, "audio")` already does.

Reuse the same Web Audio decode graph as `VoiceContext.startNativeWindowAudio` — extract it to a small helper `startNativeWindowAudioStream(api)` that returns `{ audioTrack, stop }` and call it from both contexts. (Lives in a new `src/lib/nativeWindowAudio.ts`.)

### 2. `src/lib/nativeWindowAudio.ts` — shared helper

Move the entire body of `startNativeWindowAudio` from `VoiceContext.tsx` (lines 1723–1789) into this module. Both contexts import it. No behavior change for 1-on-1.

### 3. `VoiceContext.startScreenShare` — fix browser tab audio

Change line 1544 to: `const allowAudio = effectiveAudio && (type === "screen" || type === "tab");`. Chrome will gate window-surface audio itself.

### 4. Camera visibility safety net (1-on-1)

Verify `VoiceContext` ontrack for video uses the same `unmute`-not-`mute` pattern. If it doesn't, apply the same fix so 1-on-1 cameras can't disappear either.

### 5. Verify + ship

- `npm run build` to confirm clean compile.
- Bump `package.json` version to `0.2.9` and add a changelog entry covering: native per-window audio in group calls, group camera visibility regression fix, browser tab-audio enabled.
- User runs:
  ```
  git pull && set BUILD_TARGET=electron && npm run build:electron && npx electron-builder --win nsis --x64 --publish always
  ```

### Files to edit

- `src/lib/nativeWindowAudio.ts` — new
- `src/contexts/GroupCallContext.tsx` — wire native audio into `toggleScreenShare` + cleanup in `leaveCall`
- `src/contexts/VoiceContext.tsx` — replace inline `startNativeWindowAudio` with import; fix browser tab-audio gate; verify ontrack `unmute` handling
- `package.json` + `src/lib/changelog.ts` — version 0.2.9 + entry

