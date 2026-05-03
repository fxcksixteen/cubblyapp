I found two concrete issues in the current patch that need to be fixed before I can honestly re-zip and call this ready:

1. `package.json` is still at `0.2.26`, and `package-lock.json` is even older at `0.2.1`. That explains why your desktop build command is not producing the right v0.2.27 metadata/artifact names.
2. Native iOS calling is closer than before, but there are still cross-platform edge cases that can break all-direction parity:
   - iOS sends `hangup`, while current web/desktop now expects the soft-leave event `peer-leave` for Discord-style “peer left but I stay in call”. Web accepts `hangup`, but iOS should match the new protocol.
   - iOS currently ends the entire `call_events` row on any local end, even if another participant is still live. Web/desktop only end the event when the last participant leaves. This can break rejoin/join behavior and desync call pills.
   - iOS `ready-for-offer` handling can create a new offer while an existing peer connection may not be in a safe signaling state. That needs defensive reset/stable-state handling so iOS->iOS, iOS->web, web->iOS, desktop->iOS, and iOS->desktop don’t fail from stale peer connections.
   - iOS does not auto-clear/silence unanswered incoming ringing after 30s like web/desktop, and the outgoing UI does not have the same timed-out “waiting alone/not in call” behavior.
   - Native iOS only recognizes `hangup`, not the newer `peer-leave`, so when web/desktop leaves normally, iOS may miss the correct soft-leave semantic.

Plan for the final v0.1.4 / v0.2.27 fix:

1. Desktop/web version metadata
   - Update `package.json` version from `0.2.26` to `0.2.27`.
   - Update root/package versions in `package-lock.json` to `0.2.27` so `npm run build:electron` and `electron-builder --publish always` use the correct version and artifact names.
   - Keep the existing build scripts and electron-builder config intact; only fix the missing version bump metadata.

2. Native iOS signaling parity
   - Add `peer-leave` support in `CallSignaling.swift` and treat both `peer-leave` and legacy `hangup` as “remote peer left”.
   - Change `CallStore.endCall()` to broadcast `peer-leave` instead of `hangup`, matching web/desktop v0.2.27.
   - Keep backward compatibility so older builds that still send `hangup` do not break.

3. Native iOS call-event lifecycle parity
   - Change iOS end-call cleanup to mark only the local `call_participants` row as `left_at` first.
   - Query remaining live participants for the same `call_event_id`.
   - Only update `call_events.state = ended` / `ended_at` when no live participants remain.
   - This matches web/desktop behavior and prevents call pills from being ended out from under the other platform.

4. Native iOS robust WebRTC negotiation
   - Before responding to `ready-for-offer`, make sure the iOS peer connection is in a safe state; if it is closed/failed/unstable, close and recreate it cleanly.
   - When iOS receives a fresh offer while already holding a stale peer connection, replace/reset as needed before setting the remote description.
   - Keep ICE candidate buffering until a remote description exists, then flush it reliably.
   - Preserve Unified Plan and transceiver setup already present in `WebRTCClient.swift`.

5. Native iOS 30-second ringing behavior
   - Add a 30-second incoming-call timeout so native iOS stops ringing and clears the stale incoming sheet if unanswered.
   - Add an outgoing unanswered timer so iOS stops the outgoing ringtone after 30 seconds and shows a waiting-alone/not-in-call equivalent instead of looking like it is still actively ringing forever.
   - Make sure timers are cancelled on accept, connect, decline, peer leave, and end call.

6. Native iOS UI wording/state consistency
   - Add a `ringTimedOut`-style state to `CallStore` or equivalent UI computed state.
   - Update `CallView` and `MinimizedCallPill` so unanswered calls show the same concept as desktop/web: the user is still in the call alone, but the peer is “Not in call” rather than still “Calling…”.

7. Final zip artifact
   - After the code changes are applied, package the updated `ios-native` folder again as a new v0.1.4 build zip for Xcode.
   - Use a new build number/artifact name so you can distinguish it from the previous build 7 zip.
   - Deliver the zip only after the above inspection/fixes are complete.

I will not add any unnecessary public changelog wording or personal/private details. This patch is code/version/calling reliability only.