## v0.3.16 — Found the real bug (finally)

The v0.3.15 logs you pasted have the smoking gun I was missing every previous round:

```
[Voice] Failed to initialize outgoing connection (keeping call alive): OverconstrainedError
```

Repeated on every `ready-for-offer` from geassbound. This is **not a signaling bug, not a rejoin bug, not a collision bug** — it is `getUserMedia()` itself throwing on YOUR device before any SDP is ever created. That is why:

- It only happens between you two: one of your two mics doesn't support the strict desktop audio constraints.
- DB shows both joined and heartbeat'd: the signaling/realtime layer is fine.
- The peer flips to "Not in call" after 30s: your side never got a local stream, so no offer was ever sent, so the 30s ring timeout fires on the caller.
- Pickup does "literally nothing": `acceptCall` calls `getUserMedia` → throws → catch swallows it and leaves UI hung.
- Rejoin shows "Ringing…": same throw on the rejoin path, no PC ever created.

### Root cause

`src/contexts/VoiceContext.tsx` line 691:

```ts
{ ...audioBase, sampleRate: 48000, sampleSize: 24, channelCount: 2 }
```

These are passed as **plain values** (which Chrome treats as `ideal`), BUT `deviceId: { exact: ... }` combined with `sampleSize: 24` is the trigger — almost no consumer mic supports 24-bit sample size, and when paired with an exact deviceId Chrome upgrades the whole constraint set to strict and throws `OverconstrainedError`. Your specific device + her specific device just happen to be the combo where one side hits it every time.

`GroupCallContext.tsx` line 113 has the identical constraint string, which is why server calls sound muffled — when the strict path silently downgrades it still ends up picking a weird 24-bit fallback profile on some Windows mics.

### Fix plan

**1. `src/contexts/VoiceContext.tsx` — `getUserMedia` (lines 679-693)**
- Drop `sampleSize: 24` entirely (no consumer mic supports it, it's the actual culprit).
- Keep `sampleRate: 48000` and `channelCount: 2` but wrap in try/catch: if the strict attempt throws `OverconstrainedError`, retry with just `audioBase`. Log which path succeeded.
- Log the actual `getSettings()` of the acquired track so we can see sampleRate/channelCount post-acquisition.

**2. `src/contexts/GroupCallContext.tsx` — same constraint string (line 113)**
- Same treatment: drop `sampleSize: 24`, add OverconstrainedError fallback. This also fixes the muffled server-call audio because the failing strict path was silently giving a degraded stream on affected mics.

**3. `src/contexts/VoiceContext.tsx` — error handling around `getUserMedia` calls**
- The four `getUserMedia()` call sites in the outgoing/incoming/rejoin paths catch and swallow. Make them surface a toast "Mic init failed — check input device" so future failures are visible instead of leaving the UI in zombie "Calling…" / "Ringing…" state.

**4. `src/contexts/GroupCallContext.tsx` — m-line ordering bug**
Logs show:
```
Failed to execute 'setLocalDescription' on 'RTCPeerConnection': Failed to set local offer sdp: The order of m-lines in subsequent offer doesn't match order from previous offer/answer.
```
This fires when a peer joins late and we call `pc.addTrack` after a prior negotiation. Fix: use `pc.addTransceiver('audio', { direction: 'sendrecv' })` up front when creating each PC so the m-line order is fixed, then `replaceTrack` on the existing transceiver instead of `addTrack` for screen-share audio additions. Standard glare-safe pattern.

**5. Version + changelog**
- `package.json` → `0.3.16`
- `src/lib/changelog.ts` → entry: "Calls between kaszy & geassbound (and any pair where one mic rejected 24-bit audio) now work — root cause was getUserMedia OverconstrainedError swallowed silently"; "Server call audio no longer muffled (same constraint fix)"; "Server group call m-line ordering crash on late peer joins fixed".
- `CURRENT_VERSION` constant in VoiceContext if present.

### Explicitly deferred to a later patch (told you last round, still true)
- Server-voice UI redesign away from group-DM look
- SidebarVoiceCard wiring for server calls
- Screen-share button in server call UI
- Profile modal space-theme bug

### Files touched
- `src/contexts/VoiceContext.tsx`
- `src/contexts/GroupCallContext.tsx`
- `package.json`
- `src/lib/changelog.ts`
