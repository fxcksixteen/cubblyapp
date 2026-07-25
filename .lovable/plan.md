
## v0.4.17 desktop hotfix

Two screenshare bugs. Both diagnosed from the console screenshot on her side and the game-lag / ping-spike behavior on yours.

---

### 1. Her screenshare never starts

**Root cause (from her console):**
```
Uncaught (in promise) InvalidStateError: Failed to execute 'setRemoteDescription'
on 'RTCPeerConnection': Failed to set remote answer sdp: Called in wrong state: stable
```
Her `screenPcOutRef` receives multiple `screen-answer` broadcasts (she retried the share several times, and old in-flight answers from previous attempts land after her new PC has already been set stable by the first valid answer). The second `setRemoteDescription` throws — the promise is uncaught, and Chromium tears the whole share intent down before any track is ever announced to you. That's why you never see her in the call UI.

The `screen-offer` handler in `VoiceContext.tsx` has the same shape and can fail the same way if a stray offer arrives after her PC is stable.

**Fix in `src/contexts/VoiceContext.tsx`** (mirror the same guards in `GroupCallContext.tsx` for server/group shares):
- In the `screen-answer` branch (~line 2351): only apply when `screenPcOutRef.current.signalingState === "have-local-offer"`; otherwise log-and-drop. Wrap `setRemoteDescription` in try/catch so a stale/duplicate answer never becomes an uncaught promise rejection.
- Only apply the answer when `payload.senderId === activeCall.peerId` (or the current expected peer in group), so an answer from a prior peer/session can't corrupt the new PC.
- In the `screen-offer` branch (~line 2282): same try/catch + signaling-state guard around `setRemoteDescription`/`createAnswer`.
- On `startScreenShare`, tag the offer with a monotonically-increasing `shareId` (senderId + counter) and record it on `screenPcOutRef`. Ignore any `screen-answer` whose `shareId` doesn't match the current one. This kills the "old attempt's answer clobbers new attempt" race even when Supabase re-delivers.

**Also — her hardware acceleration is off.** With HW-accel off, preferring VP9/AV1/H.264-HW on the transceiver forces a slow SW encoder path that can stall createOffer under load. When `document.documentElement.classList.contains("cubbly-low-power")` is true, `preferScreenShareCodec` should prefer **VP8** first (fastest, most reliable SW encoder in Chromium), then VP9. This keeps the "GPU Unlock" path fully intact for everyone else.

---

### 2. Your game streams lag and spike wifi ping

Your RTX 4060 Ti is fine — the problem is upload bandwidth. Current default for 1080p60 is a **6 Mbps** ceiling (`resBitrateBase` in `VoiceContext.tsx` line ~3172 and the identical table in `GroupCallContext.tsx`). Sustaining 6 Mbps upload while a competitive game is also uploading is what's spiking your ping in Valorant and in the call itself. Videos/browsers don't hit this because their content is low-motion and the encoder never needs the full ceiling.

The `startAutomaticScreenEncoding` controller in `src/lib/screenShareEncoding.ts` also only backs off on **packet loss**. Home routers usually don't drop packets under bufferbloat — they just queue them, which shows up as RTT growth, not loss. So the current controller happily sits at 6 Mbps while your ping climbs.

**Fix in `src/lib/screenShareEncoding.ts`:**
- In the stats poll, also read `remote-inbound-rtp.roundTripTime`. Track a rolling baseline (min over the last ~20 s). If current RTT > baseline + 60 ms for 2 consecutive samples, treat it as bufferbloat and cut bitrate by 25 % (floor 600 kbps). This is the same signal Discord/Meet use to detect a saturated uplink.
- Read `outbound-rtp.qualityLimitationReason`. When it's `"bandwidth"` or `"network"`, apply the same backoff instead of waiting for loss.
- Only ramp back up (`bitrate * 1.16`) when RTT is within +20 ms of baseline **and** loss < 1.5 %.

**Fix in `src/contexts/VoiceContext.tsx` and `src/contexts/GroupCallContext.tsx`:**
- Lower `resBitrateBase` to match what Discord actually uses (Discord's "Source" 1080p60 tops out at ~4.5 Mbps, and its default is ~2.5):
  ```
  480p:  800_000
  720p:  isHighFps ? 2_000_000 : 1_500_000
  1080p: isHighFps ? 4_000_000 : 3_000_000
  1440p: isHighFps ? 6_000_000 : 4_500_000
  ```
  The RTT-aware controller can now safely open at the full ceiling (SDP munge is already gone from v0.4.16), and back down within seconds if the link can't sustain it.

Net effect for you: the stream opens at the same visual quality it does today, and the instant your uplink starts queueing it drops bitrate before your ping goes to hell. Net effect for her: the share actually starts, and on the software encoder it doesn't try to negotiate a codec her CPU can't feed.

---

### Ship

- Bump `package.json` and `src/lib/changelog.ts` to **0.4.15 → 0.4.17** (skipping wasn't done — 0.4.16 is the current version).
- Changelog (short, per project rule):
  - Fixed screensharing sometimes never starting for the viewer.
  - Screenshares now back off automatically when they'd hurt your ping.
- **Do not publish to web.** Desktop patch only.

### Not in this patch
- Native DXGI capture module still deferred (as agreed).
- DM rejoin bug still needs her console log during a failing session before I touch it again.
