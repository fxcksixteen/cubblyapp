
Goal for v0.2.18: fix the fake rejoin state, stop duplicate cross-device ringing from interfering with live calls, and finally harden Windows window-share audio.

What I verified in code:
1. The top-of-chat rejoin banner is currently false-positive.
   - `src/components/app/ChatView.tsx` shows the banner whenever there is any `latestOngoingCallEvent` in that DM and you are not already in that chat’s active call.
   - It does not check whether:
     - the current user actually left that call, or
     - another participant is still active in that same call.
   - So the UI can claim “ongoing call” when there is no real live call to rejoin.

2. The rejoin button logic is also false-positive.
   - The call pill button appears for any ongoing event (`state === "ongoing"`).
   - It is not gated to “only after this user left while the call is still genuinely active for someone else”.

3. Rejoin can place both users into a dead “calling” state.
   - `src/contexts/VoiceContext.tsx` reuses an existing `call_event` if it finds any active participant row.
   - Then it sends `ready-for-offer` without ensuring there is actually an active peer still present and able to answer.
   - That is how both sides can click rejoin and end up in the same fake call state without actually ringing each other or reconnecting media.

4. Cross-device ringing is still not fully synced.
   - `incoming-call-dismiss` exists, but the current flow still allows a sibling web/desktop session to keep showing an incoming UI after another session already answered.
   - Worse, the stale incoming UI can still call `endCall()` from the decline button, which is dangerous.

5. Do I know what the WASAPI issue is?
   - Yes.
   - The actual issue is not `GetMixFormat` anymore. That part already falls back correctly.
   - The current native code in `native/win-audio-capture/src/process_loopback_capture.cc` is still brute-forcing a small set of formats directly through `IAudioClient::Initialize`.
   - Your new error `0x88890021` is an unsupported-format failure on every tried candidate for that machine’s process-loopback client.
   - Microsoft’s process-loopback sample and docs strongly suggest this path is finicky and effectively requires format negotiation rather than “guess a few common formats”.
   - So the fix is to probe support properly and only initialize with a format the client explicitly accepts, with better fallback ordering.

Implementation plan:
1. Rebuild the DM call-state model in `ChatView`.
   - Compute a real “rejoinable” event per conversation using participant state, not just `call_events.state`.
   - Only show the top banner if:
     - there is an ongoing event,
     - the current user has a `call_participants` row for it with `left_at != null`,
     - and at least one other participant in that event still has `left_at IS NULL`.
   - If those conditions are not true, no banner.

2. Fix the call pill button rules.
   - Show `Rejoin` only when the same “rejoinable” conditions above are true.
   - For a fresh outgoing/incoming call pill, do not show rejoin immediately.
   - If nobody is still active, render it as ended in UI instead of ongoing/rejoinable.

3. Fix rejoin execution in `VoiceContext`.
   - Before treating a call as joinable, verify the target `call_event` still has another active participant besides the current user.
   - If not, do not reuse it as a live rejoin target.
   - Instead, mark it ended and prevent the fake `ready-for-offer` path.
   - Keep “join existing call” only for truly live events.

4. Harden cross-device incoming/ringing behavior.
   - Add an explicit sibling-session dismissal path when a call is accepted/connected so all other sessions immediately clear incoming UI and ringtone for that `conversationId/callEventId`.
   - Split “decline incoming ring here” from “hang up the live call”.
   - The stale browser incoming card should only dismiss its own incoming state, never be able to terminate the desktop’s already-connected call.

5. Patch the WASAPI native capture path.
   - In `native/win-audio-capture/src/process_loopback_capture.cc`:
     - use `IsFormatSupported`/shared-mode negotiation before `Initialize`,
     - prefer exact supported formats returned by the client over hand-written guesses,
     - expand fallback candidates more safely,
     - log which negotiated format won or why all were rejected.
   - Keep the current `GetMixFormat` fallback behavior, but stop relying on blind candidate guessing as the main strategy.

6. Surface clearer failure handling in Electron/renderer.
   - Keep `src/lib/nativeWindowAudio.ts` and `electron/main.cjs` aligned with the improved native errors.
   - Preserve video-only fallback, but make the new native error message precise enough to confirm whether the machine rejected all formats or PID/source resolution failed.

Files to touch:
- `src/components/app/ChatView.tsx`
- `src/contexts/VoiceContext.tsx`
- `src/components/app/VoiceCallOverlay.tsx`
- `native/win-audio-capture/src/process_loopback_capture.cc`
- optionally `electron/main.cjs` and `src/lib/nativeWindowAudio.ts`
- `src/lib/changelog.ts`

Expected result after patch:
- No rejoin banner unless there is a real live call to rejoin.
- No rejoin button until the user has actually left an ongoing live call.
- Clicking rejoin reconnects only to a truly active call, not a fake “calling” limbo.
- Answering on desktop immediately kills the web incoming UI/ring without harming the real connected call.
- Window screenshare audio gets one more real WASAPI-format negotiation fix instead of another blind guess.
