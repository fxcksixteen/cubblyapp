## Cubbly iOS v0.1.5 — fix calling, presence, screenshare watching

### The actual root cause of broken calling

iOS subscribes to and broadcasts on **uppercase** UUID channels (`UUID.uuidString` returns `ABCDEF…`), while web/desktop use **lowercase** Supabase user IDs. That means:

- `voice-global:UPPERCASE-UUID` (iOS) and `voice-global:lowercase-uuid` (web) are different Realtime topics. Rings sent by iOS land on a topic web isn't subscribed to, and vice versa.
- The `targetId` in the broadcast payload is also uppercase from iOS, while web compares with `user.id` (lowercase), so even on the (rare) chance it lands, web rejects it.

That perfectly explains the symptom: both clients can each start "their own" call, neither rings the other, both stay in lonely calling state.

### What this plan ships

1. **Calling fixed for good (cross-platform):**
   - Lowercase UUIDs everywhere on the iOS signaling layer: ring channel topic on subscribe (`subscribeToIncomingCalls`) and on outbound `ringUser`, `targetId`/`callerId`/`userId` payload fields, per-call `voice-call:` channel topic, and the `senderId` in every `voice-signal` broadcast.
   - Accept incoming rings whether `targetId` arrives upper- or lower-case (defensive parse).
   - Match the same lowercase normalization in `CallSignaling.handleIncomingCall` so old/new clients all interop.

2. **Speaker button fixed:** Today, toggling `speakerOutput` calls `reapplyAudioSession()` which calls `setCategory(.playAndRecord, …)` synchronously while the mic track is hot. On some devices this glitches the input track and produces the "speaker = mute" symptom. Fix:
   - Apply the route change with `overrideOutputAudioPort(...)` only (no full `setCategory` reset) when only the speaker toggle changed.
   - Make the speaker tap target an explicit `.contentShape(Circle())` + `.allowsHitTesting(true)` and move it out of the row that hosts the drag gesture so the gesture recognizer never wins the tap.
   - Confirm via simulator/device that toggling the speaker button changes the audio route only, never `voiceClient?.setMicEnabled`.

3. **Presence — DB-backed and consistent (parity with web/desktop):**
   - `PresenceService` already uses the `global:online` channel and refreshes `profiles.status`, but it pulls every profile every 10 s. Tighten it: subscribe to `postgres_changes` for INSERT+UPDATE on `profiles` (currently UPDATE only) so newly created users light up immediately, and lower the bulk poll to a safety net every 60 s.
   - Add a `presence_heartbeat` RPC call every 30 s using `SessionStore.shared?.sessionKey` so iOS shows online for everyone else exactly the way web/desktop do (the DB function already exists).
   - Use `online_user_ids(_window_seconds := 75)` RPC as a one-shot reconciler on app foreground so even if the websocket lied, the truth from Postgres wins within seconds.
   - Surface a single `effectiveStatus(userID, storedStatus)` that the rest of the app uses — replace any places still reading `profiles.status` directly.

4. **Screenshare watching, end-to-end:**
   - Once signaling is fixed, the existing `handleScreenOffer` path will work, but two issues remain:
     - Screen video track lacks audio. iOS currently only adds a recvonly *video* transceiver on `screenClient`. Add a recvonly **audio** transceiver too so the peer's shared system audio plays through the call's audio session.
     - The renderer rebuilds on every state change. Cache the `RTCMTLVideoView` per track to avoid the brief black-flash + dropped frames.
   - UI/UX upgrade in `CallView` and `FullScreenScreenShareView`:
     - Pinch-to-zoom and double-tap-to-zoom on the inline preview and fullscreen view.
     - "LIVE" pill + sharer name overlay; auto-hide controls after 2 s of inactivity in fullscreen.
     - Landscape support in fullscreen (rotate-aware, hides system UI).
     - Tap-to-pause overlay (pauses local rendering only, doesn't drop the track).

5. **Verification flow before shipping v0.1.5:**
   - Foreground iOS ↔ web call: ring lands on both directions, audio flows both ways, hangup ends `call_event`.
   - Speaker button toggles the route audibly; mic stays open; no accidental mute.
   - Presence: open web on user A, force user B (iOS) to DND/Idle/Invisible — A sees the change in <3 s; iOS reflects A's flips within the same window.
   - Web shares screen → iOS sees video + hears system audio; pinch zoom works; fullscreen rotates.

### Technical details

- Files touched: `ios-native/Sources/Cubbly/Core/Services/CallSignaling.swift` (lowercase UUIDs in topics + payload, defensive parse on receive), `…/CallStore.swift` (use `userId.uuidString.lowercased()` everywhere it serializes a UUID into Realtime, add recvonly audio transceiver to `screenClient` in `handleScreenOffer`, split `reapplyAudioSession` into `applySpeakerRouteOnly` for non-disruptive route changes), `…/PresenceService.swift` (presence_heartbeat RPC + INSERT subscription + 60 s safety poll + foreground reconcile), `…/Features/Call/CallView.swift` (speaker hit-test fix, pinch zoom on screenshare preview, controls auto-hide), `…/Features/Call/FullScreenScreenShareView` (rotation, gesture stack), and any view importing `profiles.status` directly to use `PresenceService.effectiveStatus`.
- No DB migration needed — `presence_heartbeat`, `online_user_ids`, and `profiles` postgres_changes all already exist.
- Bumps: `BUILD_VERSION` constant for v0.1.5 and a changelog entry inside the iOS About screen if present.

### Out of scope

- Background/locked-phone ringing via PushKit/VoIP push (you confirmed not needed for v0.1.5).
- iOS-as-screensharer (still receive-only; outgoing screenshare from iPhone stays disabled this release).