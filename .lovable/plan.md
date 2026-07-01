# v0.4.0 Bug Squash Plan

Wide sweep turned up two critical bugs and a batch of high/medium issues that will bite real users on launch day. Below is what to fix, grouped by severity. No version bump — you'll ship this on your word.

## Critical (must fix)

1. **Coins balance never updates live** — `src/contexts/CoinsContext.tsx`
   The security migration removed `user_coins` and `coin_transactions` from the realtime publication, so the current postgres_changes subscription is dead. Drop the dead listeners and instead: refresh balance after each `accrue_activity_coins` heartbeat (already in the same effect), expose a `refreshBalance()` that shop/gift/gem flows call after any RPC that spends or grants coins, and refresh on window focus.

2. **Voice-global channel collision** — `src/contexts/VoiceContext.tsx` and `src/contexts/GroupCallContext.tsx`
   Both permanently subscribe to the identical topic `voice-global:{user.id}`. The second subscribe silently steals the first's slot, so depending on mount order either 1:1 incoming calls or group incoming calls get swallowed. Give each a unique suffix (same pattern already used everywhere else in the codebase).

## High

3. **Realtime message delivery breaks on StrictMode / fast nav** — `src/hooks/useMessages.ts` (`messages:{conversationId}`) and `src/components/app/ChatView.tsx` (`typing:{conversationId}`)
   Neither channel has a unique suffix. On remount the second `.subscribe()` on the same topic throws and the listener is silently dropped — new messages / typing indicators only reappear after refresh. Add the standard uniqueSuffix.

4. **Group-call incoming broadcasts lost on every mute toggle** — `src/contexts/GroupCallContext.tsx`
   The `voice-global` subscribe effect depends on `activeCall`, so it tears down and rebuilds on every state change (~200ms blind window). Move `activeCall` to a ref (same pattern VoiceContext already uses).

5. **Silent send failures** — `src/hooks/useMessages.ts`
   Failed insert removes the optimistic message with only a console log. Add a `toast.error("Failed to send message")` and keep the draft in the composer so the user can retry.

6. **Dismiss-broadcast channel leak** — `src/contexts/VoiceContext.tsx` (`broadcastIncomingCallDismiss`)
   If SUBSCRIBED never fires (network blip), the ephemeral channel is never removed. Add an outer timeout that force-removes the channel after ~2s regardless of subscribe state.

## Medium

7. **Remote-hangup listener rebuilds on every call-state change** — `src/hooks/useActiveCallElsewhere.ts`
   `useRemoteHangupListener` and the tracker effect depend on live objects, causing constant tear-down/rebuild and a tiny window where remote-hangup broadcasts can be missed. Move `endCall` / `activeCall` reads behind refs.

8. **Ephemeral `voice-control` sender can collide with its own listener** — `src/hooks/useActiveCallElsewhere.ts` (`requestRemoteHangup`)
   Add a unique suffix on the sender channel.

9. **`ScreenSharePicker` can throw on web** — `src/components/app/ScreenSharePicker.tsx`
   Guard the `electronAPI.getDesktopSources()` call with optional chaining.

10. **Wishlist toggle has no busy guard** — `src/components/app/ShopView.tsx`
    Rapid taps fire concurrent RPCs. Add a per-item pending flag with optimistic UI.

11. **Honey gift RPC errors are swallowed** — `src/components/app/HoneyGiftModal.tsx`
    Add a `toast.error(...)` on the RPC error path (currently only the "not enough gems" client-side case is surfaced).

12. **Push notifications fire to users actively reading** — `src/hooks/useUnreadCounts.ts` + `ChatView` mount points
    Audit every place that mounts `ChatView` to ensure `setActiveConversation(conversationId)` is called on mount and cleared on unmount, so the 30s-suppression window actually kicks in.

13. **HoneyGiftMessage subscribes before initial fetch resolves** — `src/components/app/chat/HoneyGiftMessage.tsx`
    Move the `supabase.channel(...)` subscribe to run after the initial fetch resolves; add a unique suffix.

14. **`activity_details` DELETE handler may silently ignore rows** — `src/contexts/ActivityContext.tsx`
    Without `REPLICA IDENTITY FULL`, OLD row may not carry `user_id`. Fall back to a full refetch on DELETE when `oldRow.user_id` is missing.

## Low (batch with the above)

- Use `crypto.randomUUID()` for optimistic message temp IDs.
- Modal queue: no prod-visible bug; leave as-is.

## Out of scope

- No design changes. No new features. No version bump. Purely correctness fixes.
- iOS app is untouched.

## Verification

- Typecheck after each cluster.
- Manually verify: send a message (toast on failure), incoming 1:1 + group call ring, gem purchase updates balance without refresh, wishlist double-tap doesn't double-charge, screen share picker still opens on desktop.
