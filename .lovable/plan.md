# v0.3.16 plan

Three rounds of "fix kaszy ↔ geassbound DM calls" have shipped without you sending me console logs — and the DB shows that both of you actually join the same `call_event` and heartbeat for ~50s every attempt, then both leave. That means the **DB / signaling-channel sides connect fine, but the WebRTC peer connection never produces audio between you two specifically**. I cannot keep guessing at that one blind. I'm going to add targeted diagnostic logging this version while shipping real fixes for everything else you reported.

## 1. DM call kaszy ↔ geassbound — diagnose for real (no more blind shotgun fixes)

Add structured `[VoiceDiag]` logs at every WebRTC milestone in `VoiceContext.tsx`:
- `setLocalDescription` / `setRemoteDescription` (which side, which type, signalingState before/after)
- `onicecandidate` (count, candidate types: host / srflx / relay)
- `oniceconnectionstatechange`, `onconnectionstatechange`, `onsignalingstatechange`
- `ontrack` (kind, stream id, track id)
- whether remote audio element receives a stream and whether it actually starts playing (`onloadedmetadata`, `onplaying`)
- inbound-rtp stats every 3s (packetsReceived, bytesReceived, jitter) — if `packetsReceived` stays at 0 after the PC says `connected`, that pins the problem to ICE/TURN; if there's no `connected` at all that's a signaling/glare bug

Then, next time you try a call with her, send me the console log and I will actually know what's broken instead of patching around it.

While I'm in there, also fix one suspected actual issue in 0.3.15: when **both of you click "call" at almost the same moment**, the AppLayout guard sends you into `acceptCall()` but the other side is still in `startCall()` outgoing mode — so neither side is in the role the other expects. Add an explicit "I see an ongoing call_event for this conversation in DB already, switch my click into the rejoin / join-existing path" branch in `startCall()` itself, not just in AppLayout. This makes the click-collision case deterministic.

## 2. Server voice call audio is muffled / underwater

`GroupCallContext.tsx` `getUserMedia` is using a stripped-down audio constraint:
```
{ echoCancellation, noiseSuppression, autoGainControl }
```
DM calls (`VoiceContext.tsx`) use `sampleRate: 48000, sampleSize: 24, channelCount: 2` and Opus SDP munging at `maxaveragebitrate=510000;stereo=1;sprop-stereo=1;useinbandfec=1;maxplaybackrate=48000`. Server calls don't.

Bring server calls to parity:
- Same hi-fi constraints in `GroupCallContext.getUserMedia` (mobile-safe fallback like DMs)
- Apply the same `mungeOpusSdp` pass to every group-call offer/answer
- Respect the user's `echoCancellation / noiseSuppression / autoGainControl` settings instead of hardcoding `true`

## 3. Server-call rejoin lands you alone even though the other person is still in the channel

Repro (you described): you left, she stayed, you clicked back into the channel, you ended up alone; she had to leave/rejoin for you both to reconnect.

Root cause in `GroupCallContext`: rejoin only broadcasts a `peer-join` on the realtime channel. If her client's subscription to `group-call:<conv>` was already established before yours came back, the peer-join still works — but `peers` are only populated by `ensurePeerEntry` triggered by signaling traffic. If she doesn't initiate an offer (only the higher `user.id` offers), she may never speak up. The asymmetric offerer rule means whichever of you has the lower id never initiates and just sits there if the other side's `peer-join` listener missed the event.

Fix:
- On `peer-join`, **both** sides ensure a peer entry and the higher-id side offers (current behavior). But the rejoiner should also **proactively query DB for currently-live participants** (`call_participants` rows with no `left_at` and a fresh `last_seen_at`) and `ensurePc` + `peer-join`-style offer for each, so it doesn't rely on a single broadcast packet.
- Add a periodic reconcile (every 5s while in call): for any live DB participant we don't have a PC for, kick off a peer-join handshake. This makes "I left and came back" deterministic.

## 4. Starting screen share in a server call mutes you and the call UI spazzes

In `GroupCallContext.toggleScreenShare`, adding the screen video + audio tracks via `pc.addTrack` to every existing peer connection **triggers `onnegotiationneeded` on every PC simultaneously with no glare handling**, while the audio track is also being added with no clean separation. The "spazz" is repeated renegotiation; the mute happens because the screen audio track is being treated as the user's mic track in places.

Fix:
- Add an explicit renegotiation flow for screen share: after adding the screen tracks to all PCs, generate a new offer per PC behind a `makingOffer` guard (already wired for perfect-negotiation), serialize the renegotiations, and ensure the local **mic** track stays attached and `enabled=true` (do not let screen-share add/remove touch the mic sender).
- Tag the screen-audio sender with a known stream id (`cubbly-screen-<userId>`) — it's done for video, do the same for the audio sender — so the receiving side knows it's screen audio, not mic audio.
- Debounce the visual screen-share preview state update so the local card stops flickering during renegotiation.

## 5. Server call UI should not look like a DM group call

Today, server voice channels render `GroupCallPanel` (designed for DM group calls). Discord's server voice UI is fundamentally different: it lives inline in the channel list with member tiles and the active text channel beside it.

Build a dedicated `ServerVoicePanel` for server voice channels:
- Inline member tiles in the main content area (avatar, name, mic/deafen/screen status, speaking ring)
- Active screen shares as large tiles with click-to-fullscreen
- The text chat for that voice channel renders beside / below the tiles
- Keep the bottom action bar (mute / deafen / video / screenshare / disconnect) styled like the rest of the server UI

(Visual + layout work in `ServerView.tsx` + new `ServerVoicePanel.tsx`; no business-logic change.)

## 6. SidebarVoiceCard missing for server calls + no screenshare button in server-call UI

`SidebarVoiceCard` only reads `useVoice()` (DM context). When you're in a server voice channel, the card never renders.

Fix:
- Make `SidebarVoiceCard` also read `useGroupCall()`. Show whichever call is active. Use the server name + channel name when it's a group/server call. Wire its bottom buttons (mic, deafen, screenshare, disconnect) to whichever context owns the active call.
- Make sure it shows up in **both** `DMSidebar` and `ServerSidebar`.
- Add the missing screen-share button to the in-server call UI (currently `GroupCallPanel` has it; the new `ServerVoicePanel` from item 5 will include it).

## 7. Changelog + version bump

- `package.json` → `0.3.16`
- `src/lib/changelog.ts` → 0.3.16 entry covering all of the above, with the DM call entry honestly labeled "added diagnostics + new join-collision handling; please send console logs if it still fails so I can pin the WebRTC layer issue".
- `CURRENT_VERSION` in `VoiceContext.tsx` → `0.3.16`

## Files I'll touch
- `src/contexts/VoiceContext.tsx` — diagnostic logging, join-collision branch in `startCall`
- `src/contexts/GroupCallContext.tsx` — hi-fi audio constraints, Opus SDP munging, DB-driven peer reconcile, screen-share renegotiation + mic protection
- `src/components/app/SidebarVoiceCard.tsx` — unify DM + group/server active call display
- `src/components/app/ServerSidebar.tsx` — render `SidebarVoiceCard`
- `src/components/app/ServerView.tsx` — route server voice channels to new panel
- new `src/components/app/ServerVoicePanel.tsx` — Discord-style server voice layout
- `package.json`, `src/lib/changelog.ts`
