# v0.4.3 Final Hardening Pass

Honest answer: the big fixes are in, but "bulletproof" is a strong word for realtime voice/video over WebRTC. Here's what's still worth tightening before we call v0.4.3 truly done.

## What's already solid
- Call pickup watchdog + `peer-accepted` ack (no more stuck-on-ringing)
- TURN expiry auto-detected, strips dead creds, falls back to STUN
- Activity/game polling backs off during calls
- Screenshare encoder-level downscale + strict FPS/bitrate caps
- Audio meters throttled to 10Hz + pause when hidden
- Group calls at parity with 1:1

## What's NOT bulletproof yet

### 1. TURN is expired — real-world impact
Without a working relay, ~10–20% of users on strict NAT / mobile hotspots / corporate wifi still can't connect at all. STUN fallback doesn't help them. Options:
- Wire in Cloudflare's free TURN (Realtime product, generous free tier)
- Or Metered.ca free tier (50GB/mo)
- Or just document it as a known limit until you renew

### 2. Call reliability edge cases still untested
- Simultaneous call-both-sides (glare) — does the `peer-accepted` ack handle it?
- Network switch mid-call (wifi → cellular) — ICE restart path exists but no verification
- Rapid hang-up + redial within 2s — could race the watchdog

### 3. Screenshare — no adaptive downshift
Current caps are static per quality tier. If bandwidth drops mid-stream, we don't drop resolution automatically. Chrome's `degradationPreference: maintain-framerate` helps but doesn't rescale.

### 4. Game-lag — one gap remains
`ActivityContext` backs off during calls, but the **initial** game scan on launch is still heavy. First 2–3 seconds after launching a game while in-call could still hitch.

### 5. Group calls — mesh scaling
Current group call is full-mesh peer connections. Past ~5 people, CPU/bandwidth compounds fast. Not a v0.4.3 fix (needs SFU), but worth flagging.

### 6. No telemetry
We can't see if the fixes are actually working for users. No stats logging for ICE state, relay usage, bitrate achieved, disconnect frequency.

## Proposed v0.4.3 tightening (safe, no version bump)

1. **Cloudflare TURN integration** — free, drop-in replacement for expired TURN account. Update `get-turn-credentials` edge function to mint Cloudflare creds.
2. **Glare handling** — polite/impolite peer pattern in `VoiceContext` so simultaneous calls resolve cleanly.
3. **ICE restart on connection failure** — trigger `pc.restartIce()` on `iceConnectionState === 'failed'` before full teardown.
4. **Screenshare adaptive quality** — monitor `outbound-rtp` stats every 3s; if packet loss >5% or bitrate <50% of target, drop one quality tier automatically.
5. **Game scan first-run throttle** — skip the initial heavy scan if a call is already active; wait for next interval.
6. **Lightweight call diagnostics** — log ICE state transitions, selected candidate type (host/srflx/relay), and stream stats to console with `[voice-diag]` prefix so we can debug user reports.

## Out of scope for v0.4.3
- SFU migration for large group calls
- User-facing connection quality indicator
- Persistent telemetry to backend

## Technical notes
- No DB, RLS, or schema changes
- Edge function edit: `supabase/functions/get-turn-credentials/index.ts` (if we go with Cloudflare)
- Would need `CLOUDFLARE_TURN_TOKEN_ID` + `CLOUDFLARE_TURN_API_TOKEN` secrets if you have a Cloudflare account
- All other changes are frontend-only in `VoiceContext.tsx`, `GroupCallContext.tsx`, `ActivityContext.tsx`

---

**Bottom line:** the app is meaningfully better than it was before v0.4.3, but calling it bulletproof requires (a) working TURN and (b) the 6 tightenings above. Want me to proceed with all 6, or pick a subset?