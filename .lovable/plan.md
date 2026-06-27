## v0.3.21 — Critical fixes + sharing upgrades

### 1. Voice call pickup (the big one)
Root cause hypothesis from the prior rounds: `acceptCall` still races against the offerer's PC state when the offerer has a stale/half-open connection. Symptom matches: only "Rejoin" works, and only after the original side fully tears down.

- Rewrite the answer-side flow so the callee, on pickup, sends a fresh `please-reoffer` signal and the original caller force-closes any existing PC for that peer and produces a brand-new offer (instead of trying to reuse SDP).
- On `startCall`, if a `call_participants` row already exists for me with no live heartbeat, treat it as stale and overwrite instead of bailing.
- Fix the DM bottom call panel: when state is `idle` show "Not in call" (currently shows "ringing…" leftover from previous state because we don't reset on hangup).

### 2. Cross-device incoming-call suppression (again)
The web client must not show the incoming-call toast/modal if the same user already has an active `call_participants` row with a fresh heartbeat on another device for the same conversation. Add that check inside the `incoming-call` handler in `VoiceContext.tsx` before rendering the ring UI.

### 3. Call sound effects
- Stream-end SFX is firing on call-leave because both events go through the same teardown path. Gate it to only fire on an actual `screenshare-ended` signal, not on PC close.
- Broadcast a `peer-left` signal on hangup so other participants get the "left call" SFX too (currently only the leaver hears it).

### 4. Screenshare regression
- Add a "Watch stream" prompt: when a remote peer starts a screenshare, show a small card in the call overlay instead of auto-playing. Auto-attach the track but keep the video element hidden until the user clicks Watch.
- Fix the "second screenshare never shows" bug: when a peer stops sharing we currently leave the dead transceiver in place, so the next `addTrack` on their side maps to a transceiver we've already marked ended. Clean up the receive-side video element + transceiver mid on `screenshare-ended` so the next stream creates a fresh one.

### 5. View-once screenshot deterrents
True screenshot blocking isn't possible in a browser (Lightshot, OS-level capture, phone camera all bypass anything web). What we *can* do, and will:
- Add a "Screenshots are not protected" disclaimer line in the View-Once modal so the sender knows the actual guarantee.
- On the desktop (Electron) build only: enable `setContentProtection(true)` on the BrowserWindow whenever a view-once modal is open — this blocks Lightshot, Win+Shift+S, and macOS screencapture from seeing the window contents.
- Web build: add a `prtsc`/clipboard-image listener that immediately burns the note if a PrintScreen key is detected (best-effort, browser-only).
- Document the limitation in the changelog so expectations are honest.

### 6. Lag with hardware acceleration off
- HA-off lag is real because Chromium falls back to CPU rasterization. Mitigations: in `electron/main.cjs` when HA is disabled, also pass `--enable-zero-copy`, `--enable-features=CanvasOopRasterization`, and cap animations via a `prefers-reduced-motion`-like CSS class added to `<body>` (`.cubbly-low-power`) that disables backdrop blurs, the animated theme background, and heavy box-shadows.
- Auto-apply the low-power class when HA is off.

### 7. Group chat owner controls
- In `MemberRowMenu`, accept a `canKick` prop. In the group members panel, pass `canKick = group.owner_id === currentUserId && row.user_id !== currentUserId`.
- Add a "Remove from group" item (red) that calls a new `kick_group_member` RPC (owner-only, deletes the conversation_participants row).

### 8. Share Note modal — "More settings" page
- Inside the share modal, add a "More settings" button under the View Once row.
- Clicking animates the modal content (horizontal slide + fade) to a second "page" inside the same modal shell (no extra dialog).
- New page contains two iOS toggles:
  - **Allow recipients to edit this note** — edits sync live into the sender's personal notes.
  - **Allow recipients to save to their notes** — mutually exclusive with View Once (toggling one off-grays the other with a small caption).
- Back chevron at the top-left of page 2 slides back to page 1. Send button stays accessible from either page.
- Embed the new flags in the existing `[[cubbly:shared-note:v1]]` marker JSON (`editable`, `saveable`) — fully backward compatible because old clients just ignore unknown keys.
- Live-edit sync: store the shared note in a new `shared_note_links` table (note_id, message_id, sender, recipients[], editable, saveable). When `editable` and a recipient edits via the shared card, write through to the original note. Recipient "Save to my notes" duplicates the note into their own `notes` rows.

### 9. DM header click-to-profile
- In `ChatView` / DM header, wrap both the avatar and display name in a button that opens that user's profile card (same modal used by the member sidebar).

### Technical notes
- Files touched (frontend): `src/contexts/VoiceContext.tsx`, `src/components/app/voice/VoiceCallOverlay.tsx`, `src/components/app/voice/ServerVoicePanel.tsx`, `src/components/app/DMSidebar.tsx`, `src/components/app/chat/ChatHeader.tsx` (or equivalent in `AppLayout`), `src/components/app/NotesView.tsx` (share modal pages), `src/components/app/chat/SharedNoteMessage.tsx`, `src/components/app/MemberRowMenu.tsx`, `src/components/app/GroupMembersPanel.tsx`, `electron/main.cjs`, `src/index.css` (`.cubbly-low-power`).
- DB: new `shared_note_links` table (with grants + RLS + realtime), new RPCs `kick_group_member`, `apply_shared_note_edit`.
- Bump `package.json` to 0.3.21 and add changelog entry only after implementation.

### Open question
For "allow edits live into sender's notes" — should recipient edits be **collaborative** (anyone with the link can write, last-write-wins) or **append-only** with a visible "edited by X" trail? Cleanest UX is last-write-wins like Google Docs; confirm before I build.
