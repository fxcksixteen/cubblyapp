import { supabase } from "@/integrations/supabase/client";

/**
 * How long a participant row may go without a heartbeat before we treat it as
 * a ghost. Heartbeats run every ~10s, so 45s tolerates a couple of misses.
 */
export const PARTICIPANT_STALE_MS = 45_000;

/** True when a participant row still looks alive (recent heartbeat). */
export function isParticipantFresh(
  row: { last_seen_at?: string | null; joined_at?: string | null },
  staleMs = PARTICIPANT_STALE_MS,
): boolean {
  const baseline = row.last_seen_at ?? row.joined_at;
  if (!baseline) return true; // older backends don't track it — don't hide people
  const t = Date.parse(baseline);
  if (Number.isNaN(t)) return true;
  return Date.now() - t < staleMs;
}

/**
 * v0.4.24: close MY leftover `call_participants` rows before acquiring a call
 * session.
 *
 * When the desktop app is force-quit (or hard-hangs while sharing a game and
 * gets killed) the row stays open with a recent `last_seen_at`. Relaunching
 * within the staleness window then made `acquire_call_session` reuse the OLD
 * call_event I was "still in" instead of the one everybody else moved to — so
 * the rejoin appeared to succeed but nobody could see each other.
 *
 * Safe to call whenever we are not already locally in a call: any open row of
 * mine at that point is by definition a leftover.
 */
export async function clearOwnGhostParticipants(userId: string, conversationId?: string): Promise<void> {
  try {
    let eventIds: string[] | null = null;
    if (conversationId) {
      const { data } = await (supabase as any)
        .from("call_events")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("state", "ongoing");
      eventIds = ((data as any[]) || []).map((r) => r.id);
      if (eventIds.length === 0) return;
    }

    let q = (supabase as any)
      .from("call_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("left_at", null);
    if (eventIds) q = q.in("call_event_id", eventIds);
    await q;
  } catch (e) {
    console.warn("[callGhosts] failed to clear own ghost participant rows:", e);
  }
}
