## v0.3.19 — desktop/web

Six items below. Calling fixes are surgical so we don't regress v0.3.17/18.

---

### 1) Green pickup button "does nothing" — fix for real

**Root cause:** Since v0.3.17 the green button calls `acceptCall`, which currently re-runs `startCall(conversationId, callerId)`. `startCall` immediately checks `call_participants` for a "freshly live" peer (last_seen_at < 30s). For a brand-new outbound ring, the caller has only just inserted their row — sometimes with no heartbeat yet — so `otherActive` is `false`, the receiver path hits the `else` branch, calls `end_call_event_if_stale` + soft-closes the caller's row, then starts a **brand new** `call_event`. To the caller this looks like "they hung up" (their event got ended and they were marked left); the receiver thinks they joined a fresh empty call. That exactly matches the symptom only seen between you and your gf (depends on heartbeat timing).

The Rejoin button works because by then the caller has been heartbeating for ≥10s, so the freshness check passes.

**Fix in `src/contexts/VoiceContext.tsx` `acceptCall`:** when accepting an incoming ring, pass the known `callEventId` (already in `incomingCall.callEventId`) straight through to `startCall` so it joins THAT event unconditionally — no liveness probe, no stale-cleanup branch. Add an optional `forceJoinEventId` param to `startCall` that short-circuits the lookup-or-create block and goes straight to `isJoiningExisting = true` with the provided id. Also do an immediate `heartbeat_call_participant` for the joiner before the ICE handshake so the caller's UI flips them to "in call" instantly.

### 2) "Rejoin" vs "Join Call" wording (caller-side)

In `src/components/app/ChatView.tsx` the inline `CallEventMessage` for an ongoing call always shows `joinLabel="Rejoin"`. Compute it per event:

- If `event.created_by === user.id` AND we have **never** appeared in `call_participants` for this `call_event_id` (i.e. user is the original caller and never joined their own ring) → label = `"Join Call"`.
- Otherwise (we were in it and left, or someone else started it) → `"Rejoin"`.

Same logic for the top sticky banner. Behaviour stays identical (still calls `handleRejoin` → `startCall`). Add a tiny membership check inside the existing `rejoinableEventIds` effect — it already pulls participants for these events, so we can derive `iAmFormerMember` from the same query and pass it down.

### 3) Stale "still in call" after abrupt close / power loss

Today an unclean exit leaves `left_at = NULL` and `last_seen_at` frozen. `startCall`'s 30s freshness gate already filters those out for **other** users, but the same user re-opening Cubbly doesn't see a Rejoin button because `rejoinableEventIds` in ChatView only considers events where ANOTHER live peer is present from MY perspective — and on re-open my own ghost row is the one rotting, not the peer's.

Two-part fix:

- **On client startup** (in `VoiceContext`'s mount effect, gated to `user`): one-shot `update call_participants set left_at = now() where user_id = me and left_at is null and last_seen_at < now() - interval '45 seconds'`. Kills my own ghosts so I can cleanly rejoin.
- **`beforeunload` + Electron `before-quit`**: best-effort `navigator.sendBeacon` to a tiny edge function `voice-leave` (or reuse an existing RPC via fetch keepalive) that soft-closes my open `call_participants` rows. Already partially attempted on tab close — make it actually fire on Electron quit by wiring `app.on("before-quit")` in `electron/main.cjs` to send an IPC `voice:leaving` to the renderer with a 250ms grace window before quitting.

### 4) Ping showing 200ms+

The DM sidebar "ping" number comes from the WebRTC RTT — but right now it's reading the relay RTT through the TURN server because both peers were being forced onto TURN by the v0.3.16 `iceTransportPolicy` tweak.

- Verify in `VoiceContext.tsx` that `iceTransportPolicy` is `"all"` (not `"relay"`); if it's `"relay"`, flip back to `"all"` so the host/srflx candidates can form a direct p2p path. PA↔AT direct should be ~70–90ms.
- In the sidebar ping pill, switch the displayed value from "currentRoundTripTime" of the **selected** candidate pair only when `remoteCandidateType !== "relay"`; if relayed, append a small "(relay)" suffix so it's clear that the high number is the relay path, not real network latency.

### 5) Muted DMs/groups — visual blur

In `src/components/app/DMSidebar.tsx`, the conversation row currently only renders the 🔕 icon when `isMuted(conv.id)`. Add:

- Row wrapper gets `className` with `opacity-50 grayscale-[40%]` when muted (Tailwind already available).
- Unread badge for muted convs goes from red to a neutral muted-grey pill (Discord parity).
- Close (X) action stays available — no behavioural change.
- Hovering still highlights normally so it's obvious the row is interactive.

### 6) Desktop app still ~697 MB

What you're seeing in Windows "Installed apps" is **install footprint + user data cache** (`%AppData%\Cubbly\Cache`, `Code Cache`, `GPUCache`, `Service Worker\CacheStorage` — Chromium happily lets this grow into the hundreds of MB after a few weeks of use). The `win-unpacked` itself after v0.3.18's afterPack should be ~280–320 MB; the rest is runtime cache, not anything the installer controls.

Three real fixes:

1. **Verify afterPack actually ran.** Add a `[afterPack] ✓` sentinel write to `electron-release/.afterpack-ran-vX.Y.Z` and have `scripts/build-electron.cjs` fail the build if missing. (If it never ran in v0.3.18, that alone explains another ~120 MB.)
2. **Cap Chromium disk cache** in `electron/main.cjs` via `app.commandLine.appendSwitch("disk-cache-size", String(80 * 1024 * 1024))` (80 MB hard cap) before `app.whenReady`. Stops the cache from growing unbounded.
3. **One-shot cache prune on startup**: in `electron/main.cjs` after `app.whenReady`, if `app.getPath("userData")/Cache` size > 150 MB, delete the `Cache`, `Code Cache`, `GPUCache` subfolders. Logs `[cache] pruned X MB`. Runs once per launch.

After updating, the installed-size reading drops back toward ~350 MB and stays there.

### Version + changelog

Bump `package.json` to `0.3.19`. `src/lib/changelog.ts` entry (short, user-facing only):

- Fix: green pickup button now actually joins the call.
- Fresh outgoing calls show "Join Call" instead of "Rejoin" for the caller.
- If the app crashes or loses power mid-call, you can rejoin cleanly on next launch.
- Ping in the sidebar now reflects the real network path, not the relay fallback.
- Muted DMs and groups now appear faded in the sidebar.
- Further desktop-app slimming + a hard cap on the Chromium disk cache.
