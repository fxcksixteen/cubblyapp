# v0.4.13 hotfix plan

## Confirmed current-state findings

- The affected DM has 4,724 messages, but chat fetches only the latest page and call state/signaling uses separate tables and realtime channels; message volume is not the direct call failure mechanism.
- Recent database rows show heavy call-event churn and split/rapidly replaced live events. The client still performs separate “find, canonicalize, join/create” operations, so two devices can race before signaling begins.
- DM signaling currently contains several competing accept/rejoin/retry paths, permissively adopts mismatched call-event IDs, and can process stale offer/answer/ICE retries from an earlier negotiation.
- Screenshare starts at its full bitrate ceiling, reacts to CPU pressure only after delayed stats arrive, lowers bitrate even when resolution/encode load is the actual bottleneck, and group/server sharing lacks equivalent adaptive control.
- The diagnostics region label comes from a timezone/preference guess, not the selected ICE route. A 70 ms direct peer connection can therefore be mislabeled “US East.”
- GIF height changes after the existing double-animation-frame scroll measurement, call pills do not participate in the message-count auto-scroll effect, and `ChatView` does not send the synchronous read-cleared event used by the unread watcher.

## 1. Make one DM call session authoritative

- Add an atomic backend RPC for DM call acquisition, protected by a conversation-scoped transaction/advisory lock. It will:
  - close stale events,
  - collapse any existing duplicate ongoing events,
  - create or return exactly one canonical live event,
  - heartbeat the joining user in that same transaction,
  - return whether the client is the new caller or a joining/rejoining participant.
- Add database enforcement preventing two ongoing call events for the same DM after existing duplicates are reconciled. Include required authenticated/service grants and keep existing access policies intact.
- Route new calls, Accept, and Rejoin through this single RPC instead of separate client-side select/canonicalize/insert/heartbeat sequences.
- Preserve the original event start time when a participant restarts or rejoins.

## 2. Replace the fragile DM negotiation race

- Scope signaling to the canonical call event rather than only the conversation, isolating stale signals from prior calls.
- Use one deterministic rule: the incumbent participant creates the offer; the newly accepting/rejoining participant answers.
- Add a negotiation generation ID to offer, answer, and ICE payloads. Ignore signals from an older generation instead of adopting their call-event ID.
- Collapse the current duplicated fast/slow accept and rejoin branches into one negotiation routine with:
  - one peer connection per generation,
  - ICE buffering tied to that generation,
  - cached-answer replay only for an identical offer,
  - bounded retries,
  - an automatic ICE restart/fresh generation when both participants are live but media is not connected.
- Only show “Connected” after ICE is connected and remote media is attached; participant heartbeat alone will no longer produce a false in-call UI.
- Keep mute/deafen/camera state and microphone settings intact across an automatic recovery or app restart.
- Retain focused diagnostics for canonical event ID, negotiation generation, ICE state, and inbound audio packets so the two requested follow-up inspections can verify the actual media path.

## 3. Build one automatic screenshare mode

- Remove `optimizeFor` from persisted settings, types, DM/group encoding branches, and the Voice & Video settings UI. Existing saved values become harmless legacy data.
- Keep source, resolution, frame-rate, and audio choices; users will no longer choose Text/Clarity/Motion/Ultra behavior.
- Use one mixed-content policy for every share:
  - motion-safe capture hint,
  - maintain-framerate degradation,
  - automatic codec ordering based on desktop runtime/hardware-acceleration state rather than a user preset,
  - high sender/network priority,
  - the same policy in DM, group, and server calls.
- Improve startup quality by setting a realistic initial encoder bitrate in negotiation, beginning from a sustainable target, requesting the first usable keyframe where supported, and ramping quickly toward the selected quality ceiling instead of waiting roughly 15 seconds for an uncontrolled bandwidth probe to settle.
- Replace bitrate-only adaptation with separate CPU and network responses:
  - network loss/RTT pressure lowers bitrate,
  - encoder CPU pressure lowers encoded resolution and, only when necessary, frame rate,
  - clean sustained stats restore resolution/bitrate gradually,
  - actual outbound FPS and encode-time deltas participate in decisions.
- Recalculate downscaling if the captured game/window resolution changes mid-stream.
- Apply the same adaptive controller to every group/server screenshare sender rather than leaving mesh peers on fixed parameters.
- Set a low-latency receiver jitter-buffer target when supported, with safe fallback for browsers that do not expose it.
- When hardware acceleration is disabled, automatically select a sustainable software path and clamp dynamically rather than attempting an unsustainable game stream.

## 4. Report the real connection route

- Stop presenting timezone-derived `detectedRegion` as the active call route.
- Derive diagnostics from the nominated ICE candidate pair:
  - show “Direct peer-to-peer” when no relay is selected,
  - show the actual relay region/host only when the selected candidate is TURN,
  - keep measured RTT separate from route labeling.
- Keep the region preference in settings as a relay preference, but label it accordingly so it cannot be mistaken for the current connection.

## 5. Fix chat bottom-follow behavior

- Trigger bottom-follow when a live call pill is inserted or changes state, while respecting users who intentionally scrolled upward.
- Propagate a media-layout callback from GIF rendering so image decode/load growth performs a final bottom scroll for the sender or a viewer already following the bottom.
- Preserve the existing older-message pagination anchor and new-message divider behavior.

## 6. Make unread indicators clear reliably

- After `ChatView` successfully marks a conversation read, dispatch the same `cubbly:conversation-marked-read` event already used by the sidebar action.
- Make late unread fetch/realtime completions refuse to re-add a focused conversation that has since been acknowledged.
- Continue notifying for genuinely unread background chats, mentions, and muted/DND rules without changing notification behavior.

## 7. Release and verification

- Bump desktop version to `0.4.13` only after the fixes are in place.
- Add a short user-facing changelog entry covering call reliability, automatic smoother sharing, accurate connection info, chat bottom-follow, and unread clearing.
- Add focused tests for canonical session acquisition, negotiation-generation filtering, stream adaptation decisions, call-event/GIF bottom-follow, and read-event clearing.
- Validate the Electron build and run desktop-focused checks for:
  - new DM call, Accept, restart/Rejoin, and either participant joining first,
  - repeated recovery without a second live event,
  - browser/video/game/window/full-screen sharing at 30 and 60 FPS,
  - group/server screenshare adaptation,
  - direct versus relayed diagnostics,
  - GIF and call-pill scrolling,
  - focused-chat unread badge removal.
