# v0.3.20 — Cubbly Web/Desktop Patch Plan

## 1. Call accept/pickup — fix root cause (CRITICAL)

The "green button does nothing, but Rejoin works after the caller leaves" symptom means the callee's accept path never produces a usable answer for the original offer — only after the caller tears down and the callee re-initiates as a fresh offerer does media flow. Plan:

- In `VoiceContext.tsx`, instrument the accept path with structured logs (`[accept]` tag) at every branch: cached-offer hit, DB-offer fetch, setRemoteDescription, createAnswer, setLocalDescription, signal send, ICE-candidate flush. Ship these logs in v0.3.20 so the next failure is diagnosable in one pass.
- Replace the current "cached offer fast path vs DB liveness probe" split with a single deterministic accept flow:
  1. On ring, always pre-cache the offer (already done).
  2. On accept: if no cached offer, poll `call_events` for the latest `offer` row for this conversation for up to 1.5s before failing.
  3. Always create a fresh `RTCPeerConnection` on accept (never reuse one from a previous ring of the same conversation).
  4. Always flush queued remote ICE candidates *after* setRemoteDescription, in arrival order.
- Add a perfect-negotiation guard: the side with the lower user_id is "polite". If both sides race (caller and callee both end up as offerer on the same conversation), the impolite side rolls back and accepts the polite side's offer. This is what makes "Rejoin from the callee = works" — we're going to make accept reach the same converged state without requiring the caller to leave.
- Tear down any stale `RTCPeerConnection` for the same conversation before accept (close + nuke ICE listeners) so the answer is always written to a fresh PC.

## 2. "Join Call" vs "Rejoin" reliability

- Verify the v0.3.19 label logic actually keys off `call_participants.has_ever_joined` (or equivalent) per-user, not per-call. If not, fix.
- Make both buttons call the exact same `acceptCall()` entry point — no second code path.

## 3. Ping / TURN region

- Frankfurt showing ~70ms for an Austria↔Palestine pair means audio is being relayed through TURN even when a direct path exists, OR the picker is still reading the relay candidate-pair RTT.
- In `VoiceContext.tsx`, after ICE connected, log every candidate-pair (`local.type`, `remote.type`, `nominated`, `currentRoundTripTime`) once. Pick the lowest-RTT nominated non-relay pair; only fall back to relay RTT if no host/srflx pair is nominated.
- In `get-turn-credentials` edge function, log which region was returned and why. If we're handing out a single global TURN, add a simple geo-pick (EU vs US vs ME) based on request `cf-ipcountry` / `x-forwarded-for` country.

## 4. Screenshare quality (laggy/choppy)

- In the screenshare capture path, current constraints likely cap framerate poorly and let the encoder starve. Plan:
  - Set explicit `contentHint = "motion"` on the screen video track (currently likely "detail" or unset — "detail" is what makes gameplay choppy).
  - Raise encoder bitrate floor: `RTCRtpSender.setParameters` with `maxBitrate: 4_000_000`, `maxFramerate: 60` for the "high" quality preset, and proportionally for medium/low. Currently "lowest" likely sets a bitrate so low it stays choppy forever.
  - Prefer VP9/AV1 in SDP munging when both peers support it; fall back to VP8.
  - Add adaptive degradation preference `"maintain-framerate"` (currently default = "balanced" which drops fps to keep resolution = the "choppy" you saw).
- Add a "Screenshare Quality" dropdown that actually maps to real `maxBitrate`/`maxFramerate`/resolution values, and persist the choice.

## 5. Screenshare end sound

- In the `onended` handler for the local screen track, call the same `playStreamEndedSound()` that the manual "Stop sharing" button calls. Currently only the manual path plays it.

## 6. Multi-screenshare + click-to-focus UI

- In `ServerVoicePanel.tsx` and the DM `GroupCallPanel`, when ≥2 peers (incl. self) are sharing, render a split grid (1×2, 2×2 for 3–4 shares). Non-sharing peers collapse into a thumbnail strip at the bottom.
- Clicking any share/cam tile sets it as the focused tile (large, center); the others shrink to a side strip. Clicking the focused tile or pressing Esc/back goes back to the grid. This is *not* fullscreen — stays inside the call viewport.
- Same focus interaction for camera tiles. A click on a small cam tile makes it the focused tile.
- Add a `focusedTileId` state to the panel component; no context changes needed.

## 7. Opt-in viewing of a peer's screenshare

- Currently when a peer starts sharing we auto-attach the video element and play it. Change: on peer screenshare start, show a "Watch <name>'s screen" pill in their tile instead of auto-playing. Click = subscribe + play. Click again = leave the share (detach video element but keep the audio track if it was a combined stream).
- Track per-peer `isWatching` locally; multiple simultaneous watches are allowed (this already works at the WebRTC layer — we're only changing the UI gating).

## 8. Camera "medium" size

- Add a 3-state size cycle on cam tiles: small (default) → medium (≈40% of call viewport, in-grid) → fullscreen. Click cycles small→medium; existing Maximize button still goes to fullscreen. Medium uses the same focused-tile mechanism from item 6.

## 9. Muted DM blur

- In `DMSidebar.tsx`, replace the current opacity-only style on muted rows with `filter: blur(3px)` + reduced opacity. On hover, transition to `filter: none` + lowered opacity only. Keep the close (X) button always interactive and unblurred.

## 10. Group chat "Leave Group" context menu

- In the DM sidebar right-click menu for group conversations, add a "Leave Group" item below "Hide". On click, show a confirm dialog, then remove the user's row from `conversation_participants` for that conversation. If they're the last participant, also archive the conversation.

## 11. Hardware acceleration / gaming-mode lag

- Investigation only this patch (don't ship a change without confirming): add a one-line debug log of `app.getGPUFeatureStatus()` to `electron/main.cjs` at startup and a log of the gaming-mode "throttle" state transitions in `GamingModeContext.tsx`. The reported lag with HWA off + gaming mode on is most likely gaming-mode throttling the React render loop while HWA-off forces software compositing — combined that's brutal. Once we have logs from one session we'll fix in v0.3.21 (either auto-disable gaming-mode throttling when HWA is off, or warn the user).

## 12. Share a note to a DM

- In the personal notes right-click menu, add "Share to DM…".
- Modal step 1: pick a DM from the user's existing open DMs (list from `useConversations`). Toggle: "View once (disappears after first open)".
- Modal step 2: confirmation screen explicitly stating the note will be decrypted and posted as a message to the chosen DM, and (if view-once) will self-destruct after the recipient opens it. Requires a second click to confirm.
- Implementation: decrypt the note client-side (existing `notesCrypto.ts`), post as a new message with `metadata.kind = "shared_note"`, `metadata.viewOnce: bool`, `metadata.title`, `metadata.body`. Renderer shows a "Shared Note" card; if `viewOnce`, the body is hidden behind a "Tap to view" gate, and on open the client deletes the message row.
- No new tables needed; reuses `messages` + a metadata flag.

## 13. Desktop bundle size (697 MB)

- The user is still seeing 697 MB which is the *exact* number from before the slimming work. That means either (a) they're testing an old installer, or (b) `afterPack` isn't actually running in their build pipeline.
- Plan: add a `console.log('[afterPack] running, removed X MB')` to `scripts/electron-afterpack.cjs` and verify the GitHub Actions / local build script invokes it. Also add a post-build assertion that fails the build if the unpacked app dir is >350 MB, so we can't silently ship a 697 MB build again.
- Realistic target remains ~180–230 MB installed; if the build is honoring afterPack and still 697 MB, we'll need a screenshot of the install folder breakdown to find what's actually big.

## 14. Version bump + changelog

- `package.json` → `0.3.20`.
- `src/lib/changelog.ts` → short user-facing bullets only.

## Technical notes section

- Perfect-negotiation reference: WebRTC spec "perfect negotiation" pattern (polite/impolite roles).
- `contentHint`, `degradationPreference`, and `RTCRtpSender.setParameters` are the three knobs that actually move screenshare quality in Chromium; SDP tweaks alone don't.
- View-once notes don't need server-side enforcement for v0.3.20 (client-deletes-on-open is honest-client only); a server-side TTL/edge-function gate can come later if abuse becomes a concern.
- Items 1, 4, 6, 12 are the biggest pieces; 2, 5, 9, 10 are small; 3, 11, 13 are partly diagnostic this patch.
