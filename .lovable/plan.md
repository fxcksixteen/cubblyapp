# v0.4.16 — Hotfix: screenshare + DM first-join

Two regressions to fix. Both confirmed in the v0.4.15 logs pasted in this thread.

## 1. Screenshare completely broken

**What the logs show:** every share attempt (any resolution, any FPS) fails at the same place, immediately after codec preference:

```
[Voice] 🎞️ screenshare codec preference (electron/HW): video/H264 → video/H264 → video/H264
Failed to start screen share: OperationError: Failed to execute 'setLocalDescription' on 'RTCPeerConnection':
  Failed to parse SessionDescription. Invalid SDP line.
```

**Cause (unconfirmed, needs a 1-line verification during fix):** the `patchScreenShareVideoSdp` munge added in v0.4.13 (`src/lib/screenShareEncoding.ts`) is emitting an SDP line Chromium's parser rejects. Native window audio starts fine; codec preference runs fine; failure is at `setLocalDescription` on the munged offer/answer. The munge is the only thing touching SDP text between those two log lines.

**Fix:** stop shipping the munge in its current form. Two options, in order of preference:

1. Remove the SDP munge entirely from `VoiceContext.tsx` (all 3 call sites: 3255, 3260, 3315) and rely solely on `startAutomaticScreenEncoding`'s `setParameters` path (which already sets `maxBitrate` per-encoding). That path is what actually drives libwebrtc's rate controller in practice; the SDP `b=AS`/`x-google-*` was a belt-and-suspenders addition. Removing it restores exactly the v0.4.12 behavior for the SDP itself, plus we keep the newer per-sender bitrate ceiling and force-keyframe from v0.4.13.
2. If we later want the instant-start back, reintroduce it behind a try/catch around `setLocalDescription` that falls back to the un-munged SDP.

Going with option 1 for v0.4.16 — the goal is "screenshare works again this patch", not "screenshare starts 2 s faster".

**Verification during fix:**
- After removing the munge, confirm no other caller imports `patchScreenShareVideoSdp` (`rg patchScreenShareVideoSdp src/`).
- Typecheck.
- Leave `startAutomaticScreenEncoding` and `patchScreenShareOpusSdp` (Opus munge) untouched — Opus munge is unrelated and has been stable.

## 2. DM first-join needs manual leave + rejoin

**What the logs show (single call session, 3 attempts):**

- Attempt 1 & 2: caller acquires session → subscribes → sends `incoming-call` → receives `ready-for-offer` → sends offer → gathers ICE → *never receives an answer*. User hangs up.
- Attempt 3: same session, `dm.peerHeartbeat.live` fires, code takes the **rejoin** branch (`📡 Rejoin requested — asking active peer for an offer`) — callee immediately sends an offer, connection completes in ~1 s.

So the first two joins aren't offer-glare (v0.4.7 fixed that). They're the callee-side answerer path failing to produce an answer, while the rejoin path (which asks the *peer* to be the offerer) works every time.

**Diagnosis is unconfirmed** — I have not yet read the callee-side handler for the case "peer is already in the DB as a participant of this call_event when the incoming ring arrives". The rejoin path succeeding while the accept path fails strongly suggests the callee, on the first join, is treating the ring as a *new* call while she's already sitting in the call event (adopted from the DB via v0.4.6 changes), which puts both sides in offerer state and neither sends an answer — but I need to confirm by reading the accept handler + the "adopt active DB call event" effect before writing the fix.

**Plan for the fix, once diagnosis is confirmed:**
- Step 1 (verification, first thing in build mode): read `VoiceContext.tsx` around the accept path (~2753-2989) and the DB-adoption effect, plus the `dm.pickupWatchdog.no-live-peer` trace path, to confirm the exact state the callee is in when the first ring arrives.
- Step 2 (fix, shape depends on step 1): most likely — when the callee is already the "active peer" for this call_event at ring time, skip the accept-as-answerer path and immediately go through the same rejoin-style flow that we know works (ask the caller for an offer, or send our own offer if we hold the role). Effectively: unify first-join and rejoin so the working path runs every time.
- If step 1 reveals something else (e.g. answer being sent but dropped by the signaling channel before it's fully SUBSCRIBED), the fix moves to the signaling side instead — but this is the less likely branch given `[Voice] ✅ Signaling channel SUBSCRIBED` fires before the offer is sent.

I'll present the concrete code change as part of the build, after the diagnostic read confirms which branch we're in — I'm not going to guess the fix in the plan and then implement something different.

## 3. Ship

- Bump `package.json` and `src/lib/changelog.ts` to `0.4.15` → `0.4.16`.
- Changelog: two short user-facing bullets:
  - `Fixed screensharing not starting.`
  - `Fixed calls sometimes needing you to hang up and rejoin before audio worked.`
- Desktop-only patch, no web publish (project convention).

## Technical details

- Files touched: `src/lib/screenShareEncoding.ts` (remove/gate `patchScreenShareVideoSdp` export if unused), `src/contexts/VoiceContext.tsx` (remove 3 munge call sites; fix confirmed accept-vs-rejoin branch), `package.json`, `src/lib/changelog.ts`.
- `GroupCallContext.tsx` does NOT call `patchScreenShareVideoSdp` per the grep — server/group screenshare should already be unaffected, but I'll re-grep during build to be certain.
- No DB migration this patch.
