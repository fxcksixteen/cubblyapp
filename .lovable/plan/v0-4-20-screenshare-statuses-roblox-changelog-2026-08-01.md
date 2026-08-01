# v0.4.20 — screenshare, statuses, Roblox, changelog

## 1. Changelog line removed

Delete the "Complimentary Honey plans now renew monthly..." bullet from the v0.4.20 entry in `src/lib/changelog.ts`. No other entries touched, no version bump.

## 2. Multiple people screensharing at once

Confirmed in the code: the group and server call panels only ever render **one** remote share — `GroupCallPanel.tsx` picks `peers.find(p => p.isScreenSharing && p.screenStream)` and `ServerVoicePanel.tsx` does the same. Everyone after the first sharer is negotiated correctly but never drawn, which is exactly the "only the first person can share" symptom.

Fix: render **all** sharing peers (plus your own local preview) in a share strip — one tile per sharer, each clickable to fullscreen, with the sharer's name on it. Layout: single share stays full width as today; two or more go side by side and wrap.

The 1-on-1 DM overlay already renders local + remote simultaneously ("Both sharing"), so no viewer change there.

## 3. Screenshare that never starts / is never seen

This one is **not diagnosed yet** and I won't pretend otherwise. Your log shows the receive side getting `screen-offer` → 22 `screen-ice-candidate` → `screen-stop`, three times, with no remote screen track ever arriving. That rules out "the offer never got sent" and points at the screen peer connection failing after answering — either the answer is being dropped by the sharer's guards (`shareId` mismatch, `signalingState !== "have-local-offer"`, `senderId !== peerIdRef`) or the screen PC's ICE never connects (note the earlier `TURN relay did not produce candidates quickly` line — the voice PC survived on srflx, a screen PC may not).

Step one is instrumentation, then the fix:

- Log the screen PC lifecycle on both sides the same way the voice PC is logged: `signalingState`, `iceConnectionState`, `connectionState`, selected candidate pair, and `ontrack`. Today the screen PC logs nothing, which is why "nothing weird in the logs" — there is nothing at all.
- Log every dropped `screen-answer` with the reason (which guard rejected it) instead of silently returning.
- ICE hardening for the screen PC regardless of cause: wait for TURN credentials before creating it (reuse the same servers the voice PC ended up with), add an ICE-failure restart, and a watchdog that re-sends the offer if no track has arrived after ~5s.
- Remove the "close prior incoming PC on new offer" behaviour when the incoming offer carries a *different* `shareId` from a *different* sharer — with multiple sharers that teardown kills a healthy stream.

Multiple concurrent inbound shares in DMs need the single `remoteScreenStream` / `screenPcInRef` slots to become maps keyed by sharer id (group context already keys per peer).

## 4. Custom statuses are invisible to everyone else

Confirmed: `custom_statuses` is only ever read for your own user (`UserPanel`, `ProfilePopup`, `CustomStatusModal`). Nothing fetches another user's status anywhere, so it can't show in the DM sidebar, profile modals, member lists or chat topbar. Database read access for other users is already allowed, so this is purely frontend.

Add a shared custom-status source (batch fetch by user id + realtime updates, expiry respected) and surface it in:
- DM sidebar rows (secondary line, under the name)
- profile popup / profile modal
- chat thread topbar
- server member list and group member panel

## 5. User panel status behaviour

Current `UserPanel.tsx` cross-fades username ↔ status on a 4s interval. Change to: when a status is set, the status line is shown **permanently**; the username slides in only while the pointer is over the panel, and slides back out on leave. No timer.

## 6. Roblox "Playing" in launcher

Confirmed gap in `src/contexts/ActivityContext.tsx`: the launcher-vs-game downgrade only happens when `getGameDetails` returns a payload. If the parser returns null (no fresh logs, log read failure), `effective` keeps `type: "game"` and you get "Playing Roblox" while the stale `activity_details` row still says "In Launcher" — the exact mismatch you're seeing.

Fix: for Roblox specifically, treat a missing/failed parse as launcher (`software` → "Using"), never as a game; clear the stale `activity_details` row when the parse says launcher; and keep "In Game" only when a placeId/universeId/experience is actually present in a fresh log.

## 7. Native DXGI capture

Already in the repo and already wired (`native/win-dxgi-capture/**`, `winvideo` IPC in `electron/main.cjs` / `preload.cjs`, `src/lib/nativeWindowVideo.ts`, consumed by both `VoiceContext` and `GroupCallContext`). Per `HANDOFF.md` these are hand-written and must not be regenerated, so **nothing here gets rewritten**. The planned main-side ack throttling is explicitly left alone. The screenshare work above stays on the WebRTC/signalling and UI side and will not touch those files.

## Technical notes

Files changed: `src/lib/changelog.ts`, `src/components/app/GroupCallPanel.tsx`, `src/components/app/ServerVoicePanel.tsx`, `src/contexts/VoiceContext.tsx`, `src/components/app/VoiceCallOverlay.tsx`, `src/components/app/UserPanel.tsx`, `src/contexts/ActivityContext.tsx`, plus a new custom-status hook/context and the components that render it (DM sidebar, profile popup, chat topbar, member lists). No database migration is required. No files listed in `HANDOFF.md` are modified.
