## v0.1.2 iOS — Calls, GIFs, Mic Test, Sign Out

### The real reason calls don't work between iOS and Web

The web app broadcasts every WebRTC signal under a **single Realtime event called `voice-signal`** and tells them apart by `payload.type` (`"offer"`, `"answer"`, `"ice-candidate"`, `"hangup"`, `"ready-for-offer"`, etc.).

The iOS app currently broadcasts and listens under **separate event names** (`offer`, `answer`, `ice-candidate`, `hangup`, `peer-mute`, …). So nothing iOS sends ever reaches web, and nothing web sends ever reaches iOS — every cross-platform call sits forever in "calling…" until it times out, which is exactly what you're seeing. Even iOS↔iOS works only by accident, never iOS↔web.

This single mismatch is why calls "still don't work" and why the systems are "not in sync." Pills appear because `call_events` rows are inserted via Postgres (separate path), but the actual realtime audio negotiation never connects.

### What v0.1.2 will fix

**1. Cross-platform call signaling (the big one)**
- Rewrite `CallSignaling.swift` to send and receive everything on the single `voice-signal` event, with `type` inside the payload — matching web exactly.
- Add support for the `ready-for-offer` message web uses when joining an existing call. This is what makes "Join" work without ringing again.

**2. "Join" pill no longer creates duplicate calls**
Rewrite the join flow in `CallStore` and `ChatView.joinCall` to mirror web's `startCall` logic precisely:
1. Look up the most recent `ongoing` `call_event` for this conversation.
2. Check `call_participants` for any **other** user with `left_at IS NULL`.
3. If yes → reuse that `call_event_id`, insert our own `call_participants` row, send `ready-for-offer` over the existing `voice-call:{conversationId}` channel — peer responds with an offer, we answer. **No new call_event row, no new ring.**
4. If no other live participant → mark the stale event ended and start fresh.
- Also: if a ring for this conversation is already on screen, "Join" auto-accepts that ring instead of starting anything new.

**3. CallKit / call_event lifecycle parity**
- iOS will now insert/upsert a row into `call_participants` when joining (web does this; iOS was skipping it, which is why web never saw iOS as "present" and vice versa).
- iOS will set `left_at = now()` on its `call_participants` row on hangup, so the next person clicking "Join" correctly sees there's nobody left and starts fresh.

**4. GIF picker — single tap sends**
In `GiphyPickerView`:
- Single tap → `onPick(url)` + dismiss (already wired, but the parent handler in `ChatView` was looking for an attachment-style payload). Fix the `ChatView` `onPick` closure to send the GIF URL as a normal message immediately.
- Long-press → toggle favorite (keep current behavior; matches web).
- Remove the double-tap-favorites behavior since it's confusing.

**5. Mic test in Voice & Video settings (Discord-style)**
Add a "Mic Test" section to `VoiceVideoSettingsView`:
- "Test Mic" button starts capturing from `AVAudioEngine` for ~10s.
- A live input-level meter (animated bar) shows mic activity in real time.
- A second button plays back the recording so you can hear yourself, just like Discord's "Let's Check" test.
- Releases the audio session cleanly when the sheet closes or the test ends.

**6. Sign Out actually signs out**
The button itself works, but `SessionStore.signOut()` only calls `auth.signOut()` and never tears down realtime channels or the call store, so on some sessions the UI snaps back to signed-in. Fix:
- End any active call, unsubscribe presence + signaling, clear `currentProfile`, then call `auth.signOut(scope: .local)` so the session is killed even if the network is flaky.
- Force `state = .signedOut` immediately so RootView routes to Login without waiting for the auth-change stream.

**7. Version bump**
- `project.yml`: `CFBundleShortVersionString` → `0.1.2`, `CFBundleVersion` → `3`
- `Info.plist`: same
- `CubblyConfig.appVersion` → `"0.1.2"` (this is what the "You" tab footer reads)

### Files I'll change
- `ios-native/Sources/Cubbly/Core/Services/CallSignaling.swift` — single `voice-signal` event protocol, add `ready-for-offer`
- `ios-native/Sources/Cubbly/Core/Services/CallStore.swift` — join-existing flow, `call_participants` upsert/leave
- `ios-native/Sources/Cubbly/Features/Chat/ChatView.swift` — `joinCall` checks live participants; GIF onPick sends as message
- `ios-native/Sources/Cubbly/Features/Chat/GiphyPickerView.swift` — single tap sends; long-press favorites
- `ios-native/Sources/Cubbly/Features/Settings/VoiceVideoSettingsView.swift` — Mic Test section
- `ios-native/Sources/Cubbly/Core/Services/MicTestEngine.swift` — **new**, AVAudioEngine recorder/meter/playback
- `ios-native/Sources/Cubbly/Auth/SessionStore.swift` — robust sign out
- `ios-native/Sources/Cubbly/App/CubblyConfig.swift` — version → 0.1.2
- `ios-native/project.yml` + `ios-native/Resources/Info.plist` — version 0.1.2 / build 3

### After I'm done
I'll re-zip the project as `cubbly-ios-v0.1.2.zip` and give you the exact Xcode steps to push it to TestFlight (replace files → in Xcode confirm `ChromeStore.swift` and the new `MicTestEngine.swift` are added to the Cubbly target → Product → Archive → Distribute → upload). Same flow as before — your existing internal testers get it automatically once it finishes processing.