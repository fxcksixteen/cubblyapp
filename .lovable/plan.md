
I found the real problem: Cubbly is using the old Electron capture path in the renderer (`getUserMedia` + `chromeMediaSourceId`). That is exactly the kind of setup that often gives you video but no share-audio track. Electron’s current docs point to a different pipeline: `navigator.mediaDevices.getDisplayMedia(...)` in the renderer, with a main-process `session.setDisplayMediaRequestHandler(...)` that injects the user-selected source and enables `audio: 'loopback'`.

So yes — there is a legit path to try here, and your current code is not using it.

Plan:

1. Replace the Electron screenshare capture flow with the modern display-capture pipeline
- In `electron/main.cjs`, add a display-media request handler on the app session.
- When the renderer asks to start sharing, main will map the chosen desktop source to Electron’s `desktopCapturer` source object.
- For audio-enabled shares, main will grant `{ video: selectedSource, audio: 'loopback' }`.

2. Stop using the legacy renderer-only `chromeMediaSource` capture for Electron
- In `src/contexts/VoiceContext.tsx`, remove the Electron branch that calls:
  - `navigator.mediaDevices.getUserMedia({ video: { mandatory: { chromeMediaSource... }}, audio: { mandatory: ... } })`
- Replace it with:
  - renderer tells Electron which source was picked
  - renderer then calls `navigator.mediaDevices.getDisplayMedia({ video: true, audio: wantAudio })`
- This is the part most likely to fix the “window share has zero audio” bug.

3. Fix group-call screensharing too, not just 1:1
- `src/contexts/GroupCallContext.tsx` currently hardcodes `audio: false` for screenshare.
- I’ll switch group calls onto the same Electron display-capture path so group shares can send audio too.
- Right now even a perfect main-process fix would still leave group share silent unless this file is updated too.

4. Add a small Electron bridge for selected source handoff
- In `electron/preload.cjs`, expose a safe API to:
  - store the selected share source + whether audio was requested
  - clear it after capture starts/stops
- `ScreenSharePicker.tsx` can keep its current UI; it will just feed the new bridge instead of relying on old renderer constraints.

5. Keep browser behavior unchanged
- Web/browser builds will keep using normal `getDisplayMedia`.
- Only Electron desktop behavior changes.

6. Add fail-safe behavior and logging
- If Electron cannot provide an audio track for the chosen source, log that clearly instead of silently succeeding with video-only.
- Keep stop-sharing cleanup tight so source selection doesn’t get stuck between attempts.

Files I’d update:
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/contexts/VoiceContext.tsx`
- `src/contexts/GroupCallContext.tsx`
- possibly small wiring in `src/components/app/ScreenSharePicker.tsx`

What I expect after this:
- Window share should at least use Electron’s proper desktop capture audio path instead of the broken one you have now.
- Entire-screen share audio should improve too.
- Group call share audio will no longer be hard-disabled.

Rollout:
- Keep version at `0.2.4` if that’s what you want.
- Since broken installs are already on `0.2.4`, they still won’t auto-detect a “new” `0.2.4`; users already on it will need a manual reinstall of the fixed installer once I patch this.
- Fresh installs and anyone not already on broken `0.2.4` can use the republished installer normally.

Technical detail:
```text
Current broken path:
ScreenSharePicker -> sourceId
renderer getUserMedia(chromeMediaSourceId + audio mandatory)
=> often returns no usable audio track for window shares

Planned path:
ScreenSharePicker -> sourceId
renderer tells main selected source
renderer calls getDisplayMedia({ video: true, audio: true })
main session.setDisplayMediaRequestHandler(...)
=> callback({ video: selectedSource, audio: 'loopback' })
```
