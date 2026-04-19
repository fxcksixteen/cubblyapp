import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVoice } from "@/contexts/VoiceContext";
import { useGroupCall } from "@/contexts/GroupCallContext";

/**
 * Tracks whether the SAME logged-in user has an active call on a DIFFERENT
 * device/tab. Implemented via a per-user Realtime presence channel —
 * `voice-presence:{userId}`. Each device that is in a call calls
 * `track({ device_id, conversation_id, kind })`. Other devices listen and
 * report any presence entries that don't match their own device_id.
 *
 * Lets us pop a "you're already in a call on another device" modal and offer
 * to disconnect there & reconnect here.
 */
export interface ElsewhereCall {
  deviceId: string;
  conversationId: string;
  kind: "1on1" | "group";
  startedAt: string;
}

// Stable per-tab device id (random per page load)
const DEVICE_ID =
  typeof window !== "undefined"
    ? (() => {
        const w = window as any;
        if (!w.__cubblyDeviceId) w.__cubblyDeviceId = crypto.randomUUID();
        return w.__cubblyDeviceId as string;
      })()
    : "ssr";

export function useActiveCallElsewhere() {
  const { user } = useAuth();
  const { activeCall } = useVoice();
  const groupCall = useGroupCall();
  const [elsewhere, setElsewhere] = useState<ElsewhereCall | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to presence
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`voice-presence:${user.id}`, {
      config: { presence: { key: DEVICE_ID } },
    });
    channelRef.current = channel;

    const sync = () => {
      const state = channel.presenceState() as Record<string, any[]>;
      let other: ElsewhereCall | null = null;
      for (const [devId, entries] of Object.entries(state)) {
        if (devId === DEVICE_ID) continue;
        const e = entries[0];
        if (e?.conversation_id) {
          other = {
            deviceId: devId,
            conversationId: e.conversation_id,
            kind: e.kind || "1on1",
            startedAt: e.started_at || new Date().toISOString(),
          };
          break;
        }
      }
      setElsewhere(other);
    };

    channel
      .on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe();

    return () => {
      try { channel.untrack(); } catch {}
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [user?.id]);

  // Whenever THIS device is in a call, broadcast it via track(); otherwise untrack.
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const inCall = activeCall || groupCall.activeCall;
    if (inCall) {
      const conversationId = activeCall?.conversationId || groupCall.activeCall!.conversationId;
      const kind = activeCall ? "1on1" : "group";
      ch.track({
        device_id: DEVICE_ID,
        conversation_id: conversationId,
        kind,
        started_at: new Date().toISOString(),
      }).catch(() => {});
    } else {
      ch.untrack().catch(() => {});
    }
  }, [activeCall, groupCall.activeCall]);

  /** Tell the other device(s) to drop their call so this device can take over. */
  const requestRemoteHangup = useCallback(async () => {
    if (!user) return;
    const signal = supabase.channel(`voice-control:${user.id}`);
    return new Promise<void>((resolve) => {
      signal.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          signal.send({
            type: "broadcast",
            event: "hangup",
            payload: { exceptDeviceId: DEVICE_ID },
          }).finally(() => {
            setTimeout(() => {
              supabase.removeChannel(signal);
              resolve();
            }, 300);
          });
        }
      });
    });
  }, [user?.id]);

  return { elsewhere, deviceId: DEVICE_ID, requestRemoteHangup };
}

/**
 * Listens for remote hangup commands from another device of the same user.
 * Mounted once (in AppLayout). When fired, hangs up whatever local call exists.
 */
export function useRemoteHangupListener() {
  const { user } = useAuth();
  const { activeCall, endCall } = useVoice();
  const groupCall = useGroupCall();

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`voice-control:${user.id}`);
    ch.on("broadcast", { event: "hangup" }, ({ payload }) => {
      if (payload?.exceptDeviceId === DEVICE_ID) return;
      // Only honor a remote hangup if it explicitly targets the call we're in.
      // A blind broadcast must NOT be allowed to drop an active call — that
      // was killing live calls whenever any other tab/device chattered.
      const targetConv = payload?.conversationId as string | undefined;
      if (activeCall) {
        if (targetConv && targetConv === activeCall.conversationId) endCall();
        return;
      }
      if (groupCall.activeCall) {
        if (targetConv && targetConv === groupCall.activeCall.conversationId) groupCall.leaveCall();
        return;
      }
      // No active call here — nothing to hang up.
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, activeCall, groupCall.activeCall, endCall]);
}
