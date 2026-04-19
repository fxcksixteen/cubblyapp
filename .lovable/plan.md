
## Why your call keeps auto-hanging up every few minutes

Three bugs in `src/contexts/VoiceContext.tsx`, all introduced/left over from the rejoin work:

### 1. The 5-minute "lonely" timer fires unconditionally (lines 2249–2255)
```ts
if (activeCall.state === "connected") {
  lonelyTimer = setTimeout(() => {
    endCallRef.current();          // ← kills the call no matter what
  }, 5 * 60 * 1000);
}
```
It's labeled "bail if peer never reconnects" but it never actually checks whether the peer is still there. The previous summary claimed this was removed — it wasn't (the cancelled message only touched `bun.lock`). So every connected call dies at exactly the 5-minute mark.

### 2. `pagehide` ends the whole `call_event` (lines 2300–2330)
The unload handler runs on `pagehide`, which fires on:
- mobile tab backgrounding
- iOS Safari swipe-away
- desktop minimize on some setups
- bfcache navigation

…and it doesn't just mark *your* `call_participants` row as left — it sets the **entire `call_event` to `state: "ended"`**, kicking the other person out too. Should only mark your own row left; the event should only end when the last participant leaves.

### 3. `useActiveCallElsewhere` cross-device fight (`src/hooks/useActiveCallElsewhere.ts`)
Both devices/tabs of the same user track presence on `voice-presence:{userId}`. The remote-hangup path (`useRemoteHangupListener`) listens for hangup broadcasts from any other device. If a stale presence entry lingers (or the user has the web tab open in background while on desktop), a hangup broadcast can drop the active call. Combined with the new `incoming-call-dismiss` broadcast added in v0.2.17, cross-device chatter can spuriously end the call.

---

## Fix plan (one pass, only `VoiceContext.tsx`)

1. **Delete the 5-minute lonely timer entirely.** Discord doesn't auto-end connected calls. If we ever want it back, gate it on "peer participant row is missing for >N minutes" verified against `call_participants`, not a blind wall-clock timer.

2. **Rewrite the unload handler** to:
   - Always mark our own `call_participants.left_at` (keepalive PATCH) — keep this.
   - **Stop force-ending `call_event`.** Instead, fire-and-forget a tiny check: only set `state: "ended"` if we were the *last* active participant. Simplest correct version: don't end the event from the client at all on unload — let it stay `ongoing` so the other person (or we, on rejoin) can keep using it. The existing "no active participants" auto-cleanup in `startCall` (line ~1288) already prunes truly dead events when someone tries to start a new call.
   - Skip the handler entirely on `pagehide` when `event.persisted` is true (bfcache) and on mobile visibility-hide events.

3. **Tighten cross-device hangup** in `useActiveCallElsewhere.ts`:
   - Only honor a remote hangup broadcast when *this* device is NOT currently in an active call, OR when the broadcast explicitly references our current `conversationId`. Right now any hangup from any other tab kills our call.
   - Don't treat "presence sync" of another device as a reason to do anything destructive — it should only feed the conflict modal, never call `endCall()`.

4. **Bump changelog** under v0.2.17 (no version bump — you're still on 0.2.17): "Fixed calls auto-ending after 5 minutes; fixed mobile backgrounding ending the call for both users; hardened cross-device hangup so it can't kill an active call."

### Files touched
- `src/contexts/VoiceContext.tsx` — remove lonely timer, rewrite unload handler
- `src/hooks/useActiveCallElsewhere.ts` — scope remote-hangup to safe cases
- `src/lib/changelog.ts` — note under existing 0.2.17 entry

No DB changes. No version bump. No new files.
