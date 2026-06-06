# Fix v0.3.11 critical bugs

## Issue 1 — Clicking "Message" on a friend opens the wrong group chat

**Root cause (confirmed):** The `create_dm_conversation` SQL function looks up an "existing conversation" by finding any conversation that contains both users — it does NOT filter out group chats:

```sql
SELECT cp1.conversation_id ...
WHERE cp1.user_id = auth.uid() AND cp2.user_id = other_user_id
LIMIT 1;
```

So if you share a group with Aria, that group's id gets returned as her "DM," and the sidebar/route opens the group. Because the real 1:1 DM row never gets surfaced, Aria also stops appearing as a standalone DM row in the sidebar (the cached/derived list keys off whatever `openOrCreate` returns).

**Fix:** Update `public.create_dm_conversation` so the existence check only matches true 1:1 DMs:
- Join against `public.conversations c` and require `c.is_group = false`.
- Also require the conversation has exactly 2 participants (defensive — avoids matching legacy rows).
- Keep the rest of the function (insert + add both participants) identical.

After the migration, clicking "Message Aria" will return her real DM id (creating it if missing), the sidebar will show her again, and group chats will no longer be hijacked.

## Issue 2 — Voice calls broken: Accept does nothing; Rejoin shows local UI but peer stays "Not In Call"

**Symptoms recap**
- Callee taps Accept → nothing visible happens, caller never sees them join.
- Callee taps Rejoin → local call UI opens but caller still sees them as "Not In Call," and the callee never actually appears in the call to the caller either.

**What this points to** (from a read of `VoiceContext.tsx`):
- `acceptCall` sets `acceptedIncomingCallRef`, calls `setupSignaling`, and relies on the caller's offer arriving via the broadcast channel to actually create/answer the peer connection (lines ~1058–1145, ~1794+).
- "Rejoin" goes down the auto-accept branch (~1149–1208), which opens the local call view immediately but expects a fresh offer from the peer to wire up media.
- If the **signaling channel name / event name / payload shape** changed in a recent v0.3.9–v0.3.11 edit (e.g. the offer broadcast key, or the `callEventId` plumbing), the receiver subscribes to the right channel but never gets an offer it recognizes → no PC, no `heartbeat_call_participant` insert with `left_at IS NULL` → server-side participant list shows "Not In Call."

**Plan**
1. Diff the recent VoiceContext changes (the v0.3.9 → v0.3.11 commits) against the previous working version to identify the broken signaling change. Likely suspects:
   - The channel name passed to `setupSignaling` for incoming vs. rejoin.
   - The event name used for "ready-for-offer" / "offer" / "answer" broadcasts (mismatch between sender and receiver).
   - `callEventId` being undefined on the accept path so heartbeats land on a different event than the caller's.
2. Add temporary `console.log` instrumentation at: incoming-call receive, acceptCall entry, ready-for-offer send/receive, offer send/receive, answer send/receive, and the first `heartbeat_call_participant` RPC. This will pinpoint where the handshake breaks in your next test.
3. Apply the targeted fix once the broken hop is identified (most likely a one-spot signaling-key/payload alignment), and verify with a real call between two accounts that:
   - Accept → both sides show each other in the call within ~2s.
   - Rejoin → same; the rejoiner shows up on the caller's UI as in-call.
4. Bump web/desktop version to **v0.3.12**.

**Note:** Voice-call regressions of this kind almost always need 1–2 rounds of log inspection because the bug is in the live signaling between two browsers. I'll add the logs in the same edit as the DM fix so the next time you reproduce it, the console output tells us exactly which hop is silent.

## Technical summary
- **DB migration:** rewrite `public.create_dm_conversation` to only match `is_group=false` 1:1 conversations.
- **Frontend:** add temporary diagnostic logs across the voice signaling path in `src/contexts/VoiceContext.tsx`; ship the fix in the same patch if the diff inspection makes the cause obvious.
- **Version bump:** `0.3.11 → 0.3.12` in `package.json` and the changelog.
