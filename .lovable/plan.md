I’m going to treat this as a call-system correctness hotfix, not a cosmetic patch. The core rule I’ll enforce everywhere is:

```text
A call is rejoinable ONLY if there is a real ongoing call_event AND at least one other participant is actively live right now.
If not, no rejoin UI appears, no ongoing pill appears as active, and voice/video buttons start a brand-new call.
```

## What I found

- `call_participants.left_at IS NULL` is currently being treated as “live”. That is not strong enough. If a browser/PWA/native app crashes, gets suspended, or fails cleanup, rows can stay `left_at = null` forever and create fake ongoing calls.
- Rejoining has a real bug: `call_participants` has `UNIQUE(call_event_id, user_id)`, but the app tries to `insert` a new participant row after a user already left. That can fail instead of reviving the old row by clearing `left_at`.
- Stale `call_events` can’t always be ended by the current user because update permissions only allow the original caller to update their own event. That means a non-caller can detect a ghost call but fail to close it.
- The screenshare duplicate-audio problem is real: the normal call path already creates hidden audio for remote screenshare audio, then the fullscreen screenshare viewer creates another hidden audio element for the same stream. The fullscreen slider controls the duplicate while the original audio keeps playing.
- The mic test UI has live-update code, but the actual playback path bypasses parts of that graph: it sets the raw mic stream directly on an audio element, so input gain/sensitivity-style changes don’t reliably affect what the user hears live.

## Plan

### 1. Add real live-call heartbeat tracking

Backend migration:
- Add a `last_seen_at timestamptz not null default now()` column to `call_participants`.
- Add a secure backend function to mark a participant live/rejoined:
  - validates the signed-in user is the participant
  - clears `left_at`
  - refreshes `joined_at`
  - updates `last_seen_at`
  - updates mute/deafen/video/screenshare flags when provided
- Add a secure backend function to end a call only when it is stale/no-live-participants, so stale events can be cleaned up even when the current user was not the original caller.

App behavior:
- While actively in a call, web/desktop/PWA will heartbeat every few seconds.
- iOS native will also heartbeat while `CallStore.state != .idle`.
- “Live” will mean `left_at IS NULL` and `last_seen_at` is recent, not just `left_at IS NULL`.

### 2. Fix rejoin vs brand-new call decisions

Web/desktop/PWA:
- Replace the current `startCall` pre-check with a stricter live-call lookup:
  - If an ongoing event exists but has no fresh live other participant, clean/ignore it and start a brand-new call.
  - If an ongoing event has a fresh live other participant, join that exact event.
- Fix `ensureOwnParticipantRow` so rejoin revives the existing participant row instead of failing on the unique constraint.
- Make `endCall` update the exact `currentCallEventId`, not “the last ongoing call event” from the local list.
- On rejoin, reset any stale peer connection before generating a fresh offer/answer so users don’t get placed into fake “calling” UI with no actual WebRTC connection.
- Only show the top “Join Call” banner and inline “Rejoin” button when the live participant check passes.
- If the live check fails, render the event as ended/stale visually and make the voice/video buttons start a new call.

Native iOS:
- Update `CallStore.ensureOwnParticipantRow` to revive existing rows by clearing `left_at` instead of only inserting.
- Update `tryJoinExisting` to require a fresh `last_seen_at` from another participant.
- Stop treating stale `ongoing` rows as joinable in `CallEventPill` / chat timeline.
- Make `endCall` mirror web behavior: mark self left, then end the event only if no one else is freshly live.

### 3. Remove fake ongoing call pills

Web and iOS chat timelines:
- Normalize call events using the new live participant check.
- Do not render a green ongoing/rejoin state unless at least one live participant is present.
- If the database still has an old `ongoing` row but nobody is live, show it as ended/stale and opportunistically request cleanup.

This directly addresses: “if not active with at least 1 live user, rejoin should never be an option.”

### 4. Fix screenshare duplicate audio without touching native capture

I will not touch the native Windows per-window audio capture sender pipeline (`startNativeWindowAudioStream`) except for read-only integration if needed.

Receiver-side fix:
- Make exactly one audio playback owner for each remote screenshare audio track.
- Remove the fullscreen viewer’s separate hidden audio playback for screenshare streams.
- Move screenshare stream volume into the existing peer audio pipeline instead of creating another audio element.
- Keep the visible `<video>` muted so it never plays duplicate audio.
- Ensure fullscreen volume controls adjust the same real screenshare audio path the watcher is already hearing.

Expected result:
- Muting/lowering/boosting screenshare volume affects the actual screenshare audio.
- No second audio copy remains audible.
- Native window screenshare audio capture remains intact because this only changes receiver playback routing.

### 5. Make the mic test actually live-update

In `VoiceVideoSettings`:
- Rebuild the mic test playback path so audio flows through a controlled graph:
  - mic source → input gain / gate → analyser → output stream/audio element
- Apply input volume live to the graph, not only to a disconnected analyser path.
- Apply output volume live to the test audio element.
- Apply echo cancellation / noise suppression / auto gain constraints live where the browser supports it.
- If a setting requires a stream reacquire, hot-swap the stream automatically while the test stays “on” instead of forcing the user to stop and restart.
- Make sensitivity threshold changes reflect in the live test meter/playback immediately.

### 6. QA pass after implementation

After approval, I’ll implement and then verify:
- Starting a new call when no one is live creates a fresh call instead of joining a ghost.
- Rejoin appears only while the other user is actually live.
- Two users clicking the same stale rejoin pill cannot get trapped in fake separate call UIs.
- Hangup/leave updates the right call event.
- Web/desktop/PWA rejoin behavior follows the same invariant.
- iOS native call pills follow the same invariant.
- Screenshare audio has only one audible path and the volume control affects it.
- Mic test settings update live without manually stopping/restarting the test.