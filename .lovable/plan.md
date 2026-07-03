Implement a stronger v0.4.3 hotfix pass for the exact three issues: pickup stuck on ringing, game-launch call lag, and unwatchable streams.

1. Fix call pickup getting stuck after the other person accepts
- Correct the caller-side pickup watchdog so it checks the real participant heartbeat fields (`last_seen_at`/`joined_at`) instead of a non-matching heartbeat column.
- Add an explicit “peer accepted” signaling ack when the callee taps Accept so the caller stops the ringing state immediately and enters a real connecting/recovery path.
- If the answer or ICE path still does not connect after the peer is confirmed live, automatically rebuild the caller peer connection and send a forced fresh offer without requiring hang up + Rejoin.
- Keep ICE candidate queues bounded and scoped to the current call event so stale candidates from an older attempt cannot poison the next pickup.

2. Make TURN failure/expiry stop causing silent call failures
- Treat expired/missing relay credentials as a real possible cause: TURN absolutely can affect pickup and streams when either side cannot connect peer-to-peer.
- Add a short TURN/relay health timeout on startup; if relay credentials are missing, expired, or produce no relay candidates quickly, fall back to STUN/direct mode for that session instead of letting bad relay candidates slow or wedge negotiation.
- Keep diagnostics able to show whether a call is direct or relayed, so if direct STUN cannot connect because relay quota is gone, the app fails visibly instead of pretending the call is still ringing forever.

3. Stop game launch from permanently lagging active calls
- Rework activity/game polling so active calls always win over game detection: while in a call, process scans and rich game-detail probes back off hard or pause instead of continuing at the normal cadence once a game is detected.
- Reschedule the activity poll immediately when call/screenshare state changes instead of waiting until the next long timer tick.
- Keep voice audio sender priority high and reduce background stats/debug polling during active gaming/calls so CPU/network contention recovers without restarting Cubbly.

4. Make streams actually low-lag on desktop
- Enforce encoder-level downscaling and FPS caps for desktop streams, not just `getDisplayMedia` constraints that Electron/Chromium can ignore.
- Cap 480p to low bitrate + 15 FPS and 720p to moderate bitrate + 24 FPS even when the user picks motion/ultra, so “lowest quality” is genuinely lightweight.
- Lower screenshare debug/stats polling and make bitrate logs delta-based/lightweight so the stream itself is not competing with diagnostics.

5. Apply the same performance fixes to group/server calls
- Group calls still use 60 FPS audio meter loops and very high screenshare bitrate settings, so apply the same throttled meters, sender priority, downscale, FPS, and bitrate caps there too.
- Avoid tearing down group peer connections on transient ICE failure; restart ICE first, like the 1:1 call path.

6. Keep this as v0.4.3
- Do not bump the app version.
- Update the existing v0.4.3 changelog bullets only if needed, keeping them short and user-facing.