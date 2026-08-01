# v0.4.20 — not ready to ship yet

Short answer: the native capture pipeline is in and wired, but several things from your last list are **not** in the code, and the changelog is wrong.

## What IS done (verified in code)

- Native Windows capture module present at `native/win-dxgi-capture/` (untouched), loaded in `electron/main.cjs`, exposed in `electron/preload.cjs`, consumed by `src/lib/nativeWindowVideo.ts`, and used by both DM and group screenshare paths with a getDisplayMedia fallback. Packaging entries exist in `package.json`.
- Version is `0.4.20` in `package.json` and `CURRENT_VERSION`.
- Roblox launcher-vs-game logic exists in `electron/gameDetails.cjs` and `ActivityContext.tsx`.

## What is NOT done

1. **Changelog is wrong.** The v0.4.20 entry still contains "Complimentary Honey plans now renew monthly…" — the line you told me to remove. It also has no entries for the screenshare, status, or native capture work.
2. **Custom statuses still invisible almost everywhere.** `custom_statuses` is only read in `UserPanel`, `ProfilePopup`, and `CustomStatusModal`. Nothing in the DM sidebar rows, chat topbar, profile cards, group members panel, or server member list reads it — which matches exactly what you described.
3. **Only one person's screenshare can be viewed.** `GroupCallPanel.tsx` and `ServerVoicePanel.tsx` both do `peers.find(p => p.isScreenSharing && p.screenStream)` — a single sharer. Every later sharer is dropped from the UI even if their stream arrives.
4. **No ICE buffering for screenshare peer connections.** There is no pending-candidate queue for the screen PC, so candidates arriving before the remote description is applied are discarded — the "offer + ICE in logs but the stream never appears" case you hit with your girlfriend.
5. **Roblox "Playing Roblox in launcher"** still reachable — needs the launcher branch to hard-clear experience details.

## Work to do before shipping

### Screenshare
- Replace single-sharer lookup with a list of all sharing peers in `GroupCallPanel.tsx` and `ServerVoicePanel.tsx`; render one viewer per sharer (plus local), with fullscreen per stream.
- Remove any guard that blocks starting a share when someone else is already sharing (server + client side, if present in `VoiceContext` / `GroupCallContext`).
- Add a pending-ICE queue keyed by peer for the screen connection: buffer candidates until `setRemoteDescription` resolves, then flush; clear on teardown. Applies to both DM and group/server signaling.
- Re-verify the offer/answer path so a second offer from the same peer doesn't wipe an established screen track.

### Custom statuses
- Add a shared hook that batch-fetches `custom_statuses` for a set of user IDs with realtime updates.
- Show status in: DM sidebar rows, chat topbar, profile cards/modals, group members panel, server member list.
- `UserPanel`: status shown by default whenever set; cross-fade to username only on hover (no auto-rotation).

### Roblox
- In the launcher branch, clear experience name/thumbnail so it can never render "Playing Roblox in launcher".

### Changelog
- Delete the complimentary-plan line.
- Add short user-facing bullets for: everyone in a call can share at once, screenshares that never appeared now start reliably, custom statuses visible everywhere, Roblox launcher wording, plus the existing name-decoration / Northern Lights / typing-smoothness fixes.

### Ship
- Desktop patch only (no web publish), per usual.

## Technical notes

Files touched: `src/components/app/GroupCallPanel.tsx`, `src/components/app/ServerVoicePanel.tsx`, `src/contexts/VoiceContext.tsx`, `src/contexts/GroupCallContext.tsx`, new `src/hooks/useCustomStatuses.ts`, `src/components/app/DMSidebar.tsx`, `AppLayout.tsx`, `UserProfileCard.tsx`, `GroupMembersPanel.tsx`, `ServerView.tsx`, `UserPanel.tsx`, `src/contexts/ActivityContext.tsx`, `electron/gameDetails.cjs`, `src/lib/changelog.ts`. `native/win-dxgi-capture/**` will not be modified.
