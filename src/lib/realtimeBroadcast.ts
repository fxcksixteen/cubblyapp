/**
 * Fire-and-forget Realtime broadcast to a topic we do NOT hold open.
 *
 * ── WHY THIS EXISTS (v0.4.27) ──────────────────────────────────────────────
 * Sending a one-off broadcast used to mean: `supabase.channel(topic)` →
 * `.subscribe()` → `.send()` → `supabase.removeChannel()`. That is unsafe,
 * because `RealtimeClient.channel()` DEDUPES BY TOPIC:
 *
 *     const exists = this.getChannels().find(c => c.topic === realtimeTopic);
 *     if (!exists) { ...create... } else { return exists; }   // ← same object
 *
 * So asking for a topic the app already holds hands back the LIVE channel, and
 * the trailing `removeChannel()` then unsubscribes + tears it down —
 * `_onClose` → `socket._remove(this)`. Every listener bound to it dies.
 *
 * That is exactly what `broadcastIncomingCallDismiss` did to
 * `voice-global:<self>`: declining or accepting one call killed the app's own
 * incoming-call listener for the rest of the session (the effect that owns it
 * never re-runs), so no further calls rang until a restart.
 *
 * ── WHY httpSend ───────────────────────────────────────────────────────────
 * A broadcast does not require joining the topic. `RealtimeChannel.httpSend()`
 * POSTs to the Realtime REST broadcast endpoint with `apikey` plus the user's
 * JWT (supabase-js keeps `realtime.setAuth(token)` current), so it authorizes
 * at least as strongly as the websocket path. Our `voice-global:*` /
 * `group-global:*` topics are public (`private: false` — the app sets no
 * private channels and there are no RLS policies on `realtime.messages`), so
 * the apikey alone already satisfies them.
 *
 * It also removes the join race that the old code had to work around with
 * "wait for SUBSCRIBED before publishing" — there is no join at all.
 *
 * ── THE RULE ───────────────────────────────────────────────────────────────
 * Never call `supabase.removeChannel()` on a topic the app holds long-lived.
 * This helper never subscribes and never removes, so a send can never tear
 * down a listener. Channel objects it materialises are inert (unjoined) and
 * deduped by supabase-js, so they cost one object per distinct topic.
 */
import { supabase } from "@/integrations/supabase/client";

export interface BroadcastResult {
  ok: boolean;
  error?: string;
}

/**
 * Publish `event` to `topic` over the REST broadcast endpoint.
 * Never throws. Returns `{ ok: false, error }` so callers can retry.
 */
export async function broadcastToTopic(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<BroadcastResult> {
  try {
    // Deliberately no .subscribe() and no .removeChannel() — see file header.
    const channel = supabase.channel(topic) as any;
    if (typeof channel?.httpSend !== "function") {
      // Older realtime-js: send() self-falls-back to the same REST endpoint
      // when the channel can't push. Still no subscribe, still no remove.
      const res = await channel.send({ type: "broadcast", event, payload });
      const ok = res === "ok" || res === true || res === undefined;
      return ok ? { ok: true } : { ok: false, error: String(res) };
    }
    await channel.httpSend(event, payload);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/**
 * `broadcastToTopic` with a small retry, for notifications where a silent drop
 * is user-visible (an incoming call that never rings).
 */
export async function broadcastToTopicWithRetry(
  topic: string,
  event: string,
  payload: Record<string, unknown>,
  attempts = 3,
): Promise<BroadcastResult> {
  const delays = [0, 400, 1200];
  let last: BroadcastResult = { ok: false, error: "not attempted" };
  for (let i = 0; i < Math.min(attempts, delays.length); i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    last = await broadcastToTopic(topic, event, payload);
    if (last.ok) {
      if (i > 0) console.log(`[Realtime] broadcast ${event} -> ${topic} ok on retry #${i}`);
      return last;
    }
    console.warn(`[Realtime] broadcast ${event} -> ${topic} failed (attempt ${i + 1}):`, last.error);
  }
  return last;
}

/** Topic a user listens on for 1:1 incoming-call notifications. */
export const voiceGlobalTopic = (userId: string) => `voice-global:${userId}`;

/**
 * Topic a user listens on for GROUP incoming-call notifications.
 *
 * Split out from `voice-global:` in v0.4.27. Both providers used to bind to the
 * same topic, which — because channel() dedupes by topic — meant one shared
 * RealtimeChannel instance. Either provider's cleanup (or an effect re-run, and
 * VoiceContext's global effect depends on `setupSignaling`) tore down the
 * channel and silently took the OTHER provider's listener with it.
 */
export const groupGlobalTopic = (userId: string) => `group-global:${userId}`;
