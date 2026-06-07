Plan to fix only web/desktop voice calls for v0.3.12:

1. **Make signaling reliable instead of best-effort**
   - Add one small awaited broadcast helper in `VoiceContext.tsx` for call signaling.
   - Critical messages will be awaited and retried: `incoming-call`, `ready-for-offer`, `offer`, `answer`, `peer-leave`, and `incoming-call-dismiss`.
   - Serialize ICE-candidate sends through a small promise queue so the realtime client is not hit with an un-awaited burst that can drop messages during WebRTC setup.

2. **Fix both join paths**
   - **Accept button:** accept should always either answer an existing offer or reliably request a fresh offer, without depending on a single dropped broadcast.
   - **Rejoin button / call pill:** rejoin should reliably ask the live peer for an offer, then auto-answer it only for the matching conversation/call event.
   - Keep the call UI in “calling/ringing” until ICE actually connects, not fake-connected.

3. **Keep participant state correct**
   - Ensure `call_participants` heartbeat/upsert runs immediately for accept and rejoin, with the correct `callEventId`, so the other side stops showing “Not in call” once the peer really joined.
   - Keep the existing DM/sidebar fix untouched.

4. **Keep diagnostics but reduce guessing**
   - Keep focused `[Voice]` logs around subscribe/send/receive/SDP/ICE state so if anything still fails, the exact hop is visible.
   - Update `src/lib/changelog.ts` for v0.3.12 with this as the only important web/desktop fix.

Technical root cause I’m targeting: the current code sends many realtime/WebRTC signaling broadcasts without awaiting them. During offer/answer/ICE bursts, this can drop or ignore messages, which matches “Accept does nothing,” “Rejoin opens the UI but peer stays Not in call,” and “caller never sees me join.”

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>