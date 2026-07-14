## v0.4.9 plan

**Do I know what the issue is?** Yes for the reconnect storm: the realtime reconnect helper is treating intentional channel removals as real `CLOSED` failures, causing repeated reconnects on `my-profile-status` and `presence-profiles`. That can drop broadcast signaling, which explains both DM pickup/rejoin and server voice joins failing at the same time.

### 1. Stop the realtime reconnect storm
- Patch the global realtime reconnect helper so `CLOSED` events caused by our own cleanup/rebuild are ignored.
- Prevent overlapping reconnect timers for the same topic.
- Move stale-topic cleanup into the helper itself, instead of removing channels from inside the factory callbacks.
- Add concise status logs that show `SUBSCRIBED`, `CLOSED`, `CHANNEL_ERROR`, `TIMED_OUT`, and any error reason without spamming every second.

### 2. Fix DM pickup and rejoin state recovery
- Add crystal-clear `[VoiceTrace]` logs for every DM phase: start, existing call lookup, participant heartbeat, channel subscribe, incoming ring, accept, ready-for-offer, offer, answer, ICE, peer-left, timeout, and rejoin.
- On accept/rejoin, verify the current user’s participant row was actually revived; if not, retry and log the exact backend failure.
- Clear stale `ringTimedOut` / `peerLeftAt` immediately when `peer-accepted`, `answer`, or a fresh peer heartbeat proves the other person is in the call.
- If both users are live in the same call row but no peer connection appears after a short timeout, force one deterministic renegotiation from the correct offerer instead of leaving the UI at “Not in call.”

### 3. Fix server voice join reliability
- Make the group/server voice channel recover if its realtime channel closes while the user is in a call: resubscribe, then rebroadcast `peer-join`.
- Wrap the join heartbeat in explicit error handling so clicking Join cannot silently fail.
- After joining a server voice call, verify the participant row exists and log the current live participant list.
- Keep the existing participant reconciliation, but add clearer logs for “no channel,” “no participant row,” “no offer received,” and “directed peer-join sent.”

### 4. Add backend diagnostics for account-specific failures
- Add a protected diagnostic function that returns a compact voice snapshot for the current user/conversation: membership result, server membership result when relevant, ongoing call rows, and live participant rows.
- Call it from failed DM accept/rejoin and failed server join paths so the next logs immediately show whether this is a specific account/membership/call-row issue.

### 5. Prepare desktop patch metadata only
- Bump the desktop app version to `0.4.9`.
- Add a short v0.4.9 changelog entry only.
- Do not publish the web app.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
  <presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>