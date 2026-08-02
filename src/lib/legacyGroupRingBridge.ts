/**
 * TEMPORARY COMPAT SHIM — remove once >=0.4.27 is broadly installed.
 * Deleting this file plus its two call sites (VoiceContext's global channel
 * listener, GroupCallContext's handler registration) removes the whole thing.
 *
 * ── WHY ────────────────────────────────────────────────────────────────────
 * In 0.4.27 group-call rings moved from `voice-global:<uid>` to their own
 * `group-global:<uid>` topic, because `RealtimeClient.channel()` dedupes by
 * topic: both providers asking for `voice-global:<uid>` got ONE shared
 * RealtimeChannel, so either one's cleanup tore down the other's listener.
 *
 * That split leaves a version gap in one direction:
 *   new -> old : covered, the ring dual-sends to both topics.
 *   old -> new : a 0.4.26 caller still publishes only to `voice-global:<uid>`,
 *                which a 0.4.27 client no longer listens to for group rings.
 *
 * Rather than re-introduce the shared instance, VoiceContext — which already
 * owns `voice-global:<uid>` — binds `group-incoming-call` on ITS OWN channel
 * and forwards the payload here. One owner, one channel, no shared teardown.
 *
 * Both delivery paths funnel into the same handler, so a 0.4.27 caller (whose
 * ring arrives twice, once per topic) is de-duplicated by the handler itself.
 */

export type GroupRingPayload = Record<string, any>;
type GroupRingHandler = (payload: GroupRingPayload) => void;

let handler: GroupRingHandler | null = null;

/** GroupCallContext registers its ring handler. Returns an unregister fn. */
export function setLegacyGroupRingHandler(fn: GroupRingHandler): () => void {
  handler = fn;
  return () => { if (handler === fn) handler = null; };
}

/** VoiceContext forwards a legacy-topic group ring into GroupCallContext. */
export function deliverLegacyGroupRing(payload: GroupRingPayload): void {
  try {
    handler?.(payload);
  } catch (e) {
    console.warn("[legacyGroupRing] forward failed:", e);
  }
}
