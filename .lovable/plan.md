

# Fix Live Updates, Calling, and Ctrl+R Refresh

## Summary
Five categories of bugs, all with clear root causes in the code.

---

## 1. Fix Calling (Critical — Calls Never Reach Recipient)

**Root cause**: When User A starts a call, `startCall()` subscribes to `voice-call:{conversationId}` and sends an offer there. But User B is only listening on `voice-global:{userId}` for an `incoming-call` event. **The caller never broadcasts to the recipient's global channel**, so the recipient never joins the signaling channel and never receives the offer.

**Fix** in `VoiceContext.tsx` → `startCall()`:
- After subscribing to the conversation signaling channel and sending the offer, also broadcast to the **recipient's** global channel: `voice-global:{peerId}` with event `incoming-call` containing `{ targetId: peerId, conversationId, callerId: user.id, callerName }`.
- The existing global channel listener (line 851-861) will then call `setupSignaling(conversationId)` on the recipient's side, which subscribes them to the same `voice-call:{conversationId}` channel.

**Additional fix**: The `startCall` sends the offer **before** the recipient has joined the channel. Need to add a brief delay or re-send the offer after the recipient joins. Best approach: after `setupSignaling`, wait for channel subscription confirmation, **then** send the offer. Also, in the global channel handler, after `setupSignaling`, the recipient should be ready to receive offers that come after.

**Race condition fix**: The caller should send the offer with a small delay (e.g., 1-2 seconds) or the recipient's `setupSignaling` should request the offer by sending a `ready` signal, to which the caller responds by re-sending the offer.

---

## 2. Live Friend List Updates

**Root cause**: `useFriends.ts` fetches friendships once on mount and on manual actions, but has **no Supabase Realtime subscription**. When the other user accepts a request, your app never knows.

**Fix** in `useFriends.ts`:
- Add a `useEffect` with a Supabase Realtime channel subscribing to `postgres_changes` on the `friendships` table (filtered by user's ID via `or` filter or unfiltered with client-side check).
- On any INSERT/UPDATE/DELETE event, call `fetchFriends()` to refresh.
- Clean up channel on unmount.

---

## 3. Live Profile/Status/Avatar Updates

**Root cause**: `useConversations.ts` already has realtime on `messages` and `conversation_participants`, but **not on `profiles`**. When someone changes their avatar or status, it's stale until restart.

**Fix** in `useConversations.ts`:
- Add a realtime subscription on `profiles` table changes to the existing channel.
- On profile UPDATE, call `fetchRef.current()` to refresh conversations with updated profile data.

---

## 4. Conversation Ordering (Messages Pushing to Top)

**Current state**: `useConversations.ts` already subscribes to `messages` changes and calls `fetchConversations()`. This *should* re-sort. But the issue is that `fetchConversations` does N+1 queries (one per conversation for last message), which is slow and may cause visible lag.

**Fix**: The realtime handler already triggers a refetch. Verify it works — the sorting logic at line 117-121 sorts by `lastMessageAt` descending, which is correct. The issue may be that the refetch is slow. Optimize by updating the specific conversation's `lastMessage` and `lastMessageAt` directly in the realtime handler instead of doing a full refetch for every message.

---

## 5. Ctrl+R Hard Refresh

**Fix**: In the Electron `main.cjs`, register a global shortcut or handle the keyboard event to reload the window. In the web app, Ctrl+R already works natively in browsers.

For Electron, add in `main.cjs`:
```javascript
mainWindow.webContents.on('before-input-event', (event, input) => {
  if (input.control && input.key.toLowerCase() === 'r') {
    mainWindow.reload();
  }
});
```

Or simply don't disable it — Electron by default allows Ctrl+R if dev tools are enabled. The real fix: ensure `mainWindow` doesn't suppress keyboard shortcuts. Check if there's a menu setup blocking it.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/contexts/VoiceContext.tsx` | Send `incoming-call` to recipient's global channel in `startCall()`. Add offer re-send on `ready` signal. |
| `src/hooks/useFriends.ts` | Add Supabase Realtime subscription on `friendships` table |
| `src/hooks/useConversations.ts` | Add realtime subscription on `profiles` table. Optimize message-triggered updates. |
| `electron/main.cjs` | Ensure Ctrl+R reload works |

