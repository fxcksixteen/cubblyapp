# v0.4.21 screenshare hotfix plan

## Goal

Restore reliable screen sharing for browser, window, game, DM, group, and server calls; make the fullscreen image right-click menu work consistently; and prepare the desktop hotfix without overstating native game-streaming readiness.

## Changes

1. **Fix screenshare startup failures**
   - Stop passing Chromium-rejected `priority` and `networkPriority` fields in the initial `addTransceiver(...sendEncodings)` call.
   - Start each screen transceiver with only broadly supported encoding fields, then apply optional priority/quality parameters afterward with guarded `sender.setParameters()` calls.
   - Use the same compatibility path in DM, group, and server call screenshares so one call type cannot regress independently.
   - Clean up the capture track and native capture handle if transceiver setup or offer creation fails, allowing an immediate retry instead of leaving a stuck sharing state.

2. **Make screen signaling race-safe**
   - Process screen offers, answers, and ICE candidates in order per peer.
   - Ignore duplicate/stale answers when the screen peer connection is already `stable`; only apply an answer while a matching local offer is pending.
   - Buffer ICE until the correct screen peer connection has a remote description, then flush it once.
   - Prevent overlapping renegotiations from replacing the active screen connection or producing the logged `Called in wrong state: stable` error.

3. **Keep multi-user sharing independent**
   - Preserve one screen peer connection and remote stream per sharer in group/server calls.
   - Confirm stopping or restarting one share does not tear down another participant’s share.

4. **Fix fullscreen image right-click behavior**
   - The lightbox already contains Save, Copy image, Copy link, and Open in new tab actions, so diagnose why its trigger/menu is not opening reliably in the fullscreen overlay.
   - Fix event propagation/portal layering and reuse the same image action implementation as normal chat images so both locations expose identical working actions.

5. **Native game capture follow-up**
   - Keep the existing hand-written Windows Graphics Capture C++ module intact; it is already the native window-capture implementation and does not need to be regenerated to fix this signaling failure.
   - Add renderer-to-main frame acknowledgements and bounded in-flight frame delivery around the existing native module, dropping stale frames instead of building an IPC backlog under game load.
   - Raise native capture beyond the current 30 FPS ceiling only after the acknowledgement path proves the queue remains bounded under load.
   - Treat the Windows yellow capture border as an OS capture indicator, not the cause of the WebRTC failure; verify whether the installed Windows version/API permits suppressing it, without making suppression a requirement for streaming.

6. **Patch readiness**
   - Add short, user-facing v0.4.21 changelog bullets and bump the desktop version to `0.4.21` only when the fixes are validated.
   - Do not publish the web app.

## Validation

- Run the relevant TypeScript tests/type checks through the project harness.
- Verify repeated start/stop/retry in DM, group, and server call paths, including two simultaneous sharers.
- Verify both offer-order cases: ICE before offer and duplicate/late answer after the connection is stable.
- Verify fullscreen and inline image right-click actions.
- For native game capture, verify in a real packaged Electron window on Windows—not Node-only mode—and inspect capture/IPC latency and dropped-frame counters under game-like CPU/GPU load before claiming 60 FPS readiness.

## Technical note

The current browser-share failure is in WebRTC setup, before the capture source can be transmitted. More C++ is not required for that fix. The existing C++ native capture module can capture games/windows, but full high-load game-streaming readiness still requires bounded IPC flow control; otherwise 60 FPS can queue stale frames and create severe delay even when capture itself is fast.