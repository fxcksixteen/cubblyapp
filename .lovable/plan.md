# v0.4.13 Audit Report

Inspected every file touched for the patch. Everything the last turn claimed to ship is actually present and wired end-to-end. One tiny leftover to sweep.

## Verified working

**Version + changelog**
- `package.json` = `0.4.13`, `CURRENT_VERSION` = `0.4.13`, entry at top of `CHANGELOG` with short user-facing bullets (no internal detail). Nothing published to web.

**DM call reliability (caller-must-be-last bug)**
- `VoiceContext.tsx` uses the new `acquire_call_session` RPC (lines 2531, 885 in group) — atomic session acquisition, no more client-side "find or insert" race.
- `peerAcceptedCallEventRef` is now cleared on the caller side when the callee restarts and re-sends `readyForOffer` with `forceFreshOffer: true` (lines 1809–1815), so `initializeOutgoingConnection` is allowed to rebuild the PC instead of being suppressed. This is the specific path that previously required "leave and rejoin".
- `canonicalize_ongoing_call_event` still called as a safety net (line 2750).

**Screenshare — unified auto mode**
- `src/lib/screenShareEncoding.ts` present: bitrate ramp-up from ~55% of ceiling, packet-loss based back-off (>5% loss → ×0.78, <1.5% for 3 samples → ×1.16 up to ceiling), CPU-limited resolution downscale.
- Wired in both `VoiceContext.tsx:3297` (DM) and `GroupCallContext.tsx:667, 1574` (group/server).
- `optimizeFor` UI removed from `VoiceVideoSettings.tsx`. No runtime references remain.

**Chat**
- `ChatView.tsx:385–390` `callTimelineKey` effect scrolls to bottom when a call pill appears/updates.
- `InlineGif` `onLoad` triggers `scrollToBottom` after the image measures.
- `markAsReadNow` dispatches `cubbly:conversation-marked-read` (line 348); `useUnreadCounts.ts:272` listens for it — stale badge race fixed.

**Diagnostics**
- `VoiceContext.tsx:3963–4057` derives real `isRelay` + `turnServerHost` from the selected ICE candidate pair.
- `CallDiagnosticsModal.tsx:166–172` renders "Peer-to-peer" vs "Relayed (TURN)" and shows the TURN host when relayed.

**Security migration** (previous turn)
- `acquire_call_session` execute grants restricted to `authenticated` + `service_role`, public revoked. Linter warning is expected/desired.

## One cleanup to make

`src/contexts/GroupCallContext.tsx:1373` — JSDoc still mentions `optimizeFor` in the settings list even though the option is gone. Update the comment to drop `/optimizeFor` so the doc matches reality.

That is the only discrepancy found. Nothing else needs code changes; v0.4.13 is good to hand off for the second pass whenever you're ready.
