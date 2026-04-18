
# v0.2.7 plan

## 1. Screenshare audio leak (window/tab leaking system audio) — Electron

**Root cause:** `electron/main.cjs` `setDisplayMediaRequestHandler` always grants `audio: 'loopback'` whenever the renderer requested audio — regardless of whether the source is a screen, a window, or a "browser tab". Chromium/Electron has **no per-window loopback** on Windows; `loopback` always captures the whole system mix. So enabling share-audio on a window source now leaks every other app's sound.

**Fix:**
- In `electron/main.cjs`, only honor `audio: 'loopback'` when the picked source id starts with `screen:`. For `window:` sources, force `grant.audio = undefined` and log a warning.
- In `src/components/app/ScreenSharePicker.tsx`, disable / grey out the "Share Audio" toggle when `pickingType === "window" || pickingType === "tab"` (Electron path), with a small caption: "Per-window audio isn't supported on Windows — only available when sharing the entire screen." (Tabs in Electron are really windows, same restriction.)
- In `VoiceContext.startScreenShare` Electron branch, force `wantAudio = false` when `type !== "screen"` so we don't even ask for it. Browser tab path (real Chromium tab) already isolates audio correctly via `getDisplayMedia` — leave that alone.

This restores the previous correct behavior: only screen-source audio is shared; window/tab shares stay video-only on desktop.

## 2. Camera not visible to peer

The current `toggleVideo` re-creates an offer **every** time the camera turns on, but does it on the *caller* side only by manually sending an `offer` payload — the callee renegotiation handler may drop it because `pcRef.current` is in the middle of replacing a track, and we never wait for `signalingState` to actually settle.

**Fix:**
- Wire `pc.onnegotiationneeded` once, inside `createPeerConnection`, to drive renegotiation properly (debounced; only when `signalingState === "stable"`). Remove the manual offer-blast inside `toggleVideo`.
- After `sender.replaceTrack(videoTrack)`, set `transceiver.direction = "sendrecv"` *then* trigger negotiation by toggling a noop (e.g. setting `direction` again) — this fires `onnegotiationneeded` reliably on both Chrome and Safari.
- On the **callee** side, ensure the `voice-signal` `offer` handler accepts a re-offer when `pcRef.current` already exists and `signalingState === "stable"` (rollback if not, per Perfect-Negotiation pattern). Right now a re-offer arriving after the call is connected is sometimes ignored.
- Add `event.track.onunmute` → `setRemoteVideoStream(remote)` in `pc.ontrack` so the remote side actually re-renders when frames start flowing post-renegotiation.

## 3. TURN: confirm Frankfurt is actually being picked

The edge function in `supabase/functions/get-turn-credentials/index.ts` already lists `europe.relay.metered.ca` first, but the browser's ICE agent only picks the relay with lowest STUN-probed RTT — and **Cloudflare STUN isn't actually anycast on UDP/3478 from every region**, so probing can mis-rank servers. Also `iceTransportPolicy` defaults to `all`, meaning a successful direct (non-relay) candidate pair will always win → the 100 ms is likely the **direct P2P path** to your girlfriend, not the relay at all.

**Fix:**
- Add a `console.log` of the selected candidate pair (`pc.getStats()` → `candidate-pair` where `nominated && state==="succeeded"` → log `local.candidateType / local.address` and `remote.candidateType`). This will tell us in one call whether it's `relay`, `srflx`, or `host` — so we stop guessing.
- Reorder ICE servers so EU TURN is *first* and STUN list is short (one entry — extra STUNs slow gathering).
- Add `iceCandidatePoolSize: 4` (already implied) and confirm credentials reach the client (log `iceServersRef.current.length` once).
- **No code path needs to "force" relay** — 100 ms P2P between Palestine and most of EU is actually expected over consumer ISPs, so this may not be a bug. We'll surface the path in the call panel debug area so you can verify.

## 4. Call pill ordering — messages above pill

In `ChatView.tsx` the merge uses `items[i].timestamp >= ts` to insert a call pill *before* a message with equal/later ts. That's correct, **but** message groups inherit the *first* message's timestamp, so a later message added to the same group can have an actual ts > pill ts while the group's `timestamp` still says it's earlier → pill ends up after the entire group even though some messages inside it are older.

**Fix:** when merging, split a message group whenever a call pill ts falls inside its message range, so the pill lands at the correct boundary. Implementation: compute groups *after* pills are interleaved, not before.

## 5. Mobile Settings — Discord-style optimization + close button

`SettingsModal` currently renders as a centered card with a sidebar — unusable on phones (sidebar steals 280 px, no visible close button at the top, requires app restart).

**Fix (mobile only, `useIsMobile`):**
- Render as full-screen sheet (no border-radius, fills `100dvh`).
- Two-pane navigation: list of categories first; tapping one slides into a detail view with a back arrow + close (X) at top-right. Discord-mobile style.
- Category list shows section headers + items in scrollable rows; "Log Out" pinned to bottom.
- Detail view: header bar with back arrow ← / title / close X. Always visible (sticky), so users never get trapped.
- Unsaved-changes bar pinned to bottom-of-screen above the iPhone safe-area.

Desktop layout unchanged.

## 6. Mobile DM "double-tap to open" (X appears first)

The button row in `DMSidebar.tsx` shows the close X with `opacity-0 group-hover:opacity-100`. On touch devices, the first tap triggers `:hover` (revealing X) and the tap is consumed by the row, but on subsequent renders the X being visible can hijack the next tap → users tap twice, second tap hits X area.

**Fix:** in `DMSidebar`, when on mobile (`useIsMobile`):
- Always render the X button (no opacity-0), but make the row's `onClick` fire immediately on first tap.
- Wrap the X button in `e.stopPropagation()` (already there) AND give the parent button `onTouchEnd` instead of relying on `:hover`.
- Use a real swipe-to-reveal or long-press for delete on mobile rather than hover-X. Simpler: on mobile, replace hover-X with a small persistent "⋮" that opens the existing context menu.

## 7. Mobile "wrong chat opens" bug

Likely cause: `setActiveView` in the mobile `DMSidebar` callback reads a stale `conversations` array because the panel closes (`setMobilePanel("none")`) on the same tick as navigation, and React batches them so `chatIdFromUrl` derives from a route set with the previous closure. Also `visibleConversations` filtering in `AppLayout` uses `tempDMs` which mutates after navigate.

**Fix:** in mobile DMSidebar tap handler, navigate **using the conversation id captured in the closure** (not via index), and defer `setMobilePanel("none")` to a `requestAnimationFrame` after `navigate()` so the route commits first. Add a `key={conv.id}` already present — verify no shared keys across temp/permanent lists (could be the actual culprit if a temp DM and permanent DM share the same id transiently).

## 8. Version + What's New

- Bump `package.json` → `0.2.7`
- `src/lib/changelog.ts`: add v0.2.7 entry at top, `CURRENT_VERSION = "0.2.7"`
- Entry mentions: window-share audio leak fix, camera-to-peer fix, mobile settings revamp, mobile DM single-tap, message/call-pill ordering, ICE path debug logging.

## Files touched
- `electron/main.cjs` (audio grant guard)
- `src/components/app/ScreenSharePicker.tsx` (disable audio toggle for window/tab)
- `src/contexts/VoiceContext.tsx` (negotiation, ontrack onunmute, ICE debug log, force `wantAudio=false` for non-screen)
- `src/components/app/ChatView.tsx` (pill/group split ordering)
- `src/components/app/SettingsModal.tsx` (mobile two-pane + sticky X)
- `src/components/app/DMSidebar.tsx` (mobile single-tap, persistent menu instead of hover-X)
- `src/pages/AppLayout.tsx` (defer panel close after navigate)
- `package.json`, `src/lib/changelog.ts`, `src/main.tsx` (version bump)

## Build & ship (your side after I implement)
```cmd
git pull && set BUILD_TARGET=electron && npm run build:electron && npx electron-builder --win nsis --x64 --publish always
```
No need to delete any GitHub release — `0.2.7` is a fresh tag.

## Honest caveats
- **Per-window audio capture on Windows is a Chromium platform limitation.** I can't make window-share audio work; I can only stop it from leaking system audio. If you want that audio later, the only paths are (a) a native helper using WASAPI process-loopback (Win10 2004+, complex) or (b) tell users to share the whole screen.
- **TURN ping**: 100 ms across continents over relay is realistic. The debug log will tell us whether you're on relay or P2P; if P2P, TURN region is irrelevant for that call.
- **Camera fix** is the most likely-to-need-iteration item; we may need 1 more round after you test with your girlfriend if a specific browser combo (e.g. her on iOS Safari) needs additional handling.
