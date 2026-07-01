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

  // Subscribe to presence.
  // CRITICAL: unique suffix per mount — under StrictMode/HMR a leftover
  // channel with the same name throws "cannot add presence callbacks ...
  // after subscribe()" on the next mount, which crashes the whole app via
  // the ErrorBoundary and prevents the user from joining a call.
  useEffect(() => {
    if (!user) return;
    const uniqueSuffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase.channel(`voice-presence:${user.id}:${uniqueSuffix}`, {
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
  const requestRemoteHangup = useCallback(async (conversationId?: string) => {
    if (!user) return;
    const target = conversationId || elsewhere?.conversationId;
    if (!target) return;
    // v0.4.0: unique suffix so the ephemeral sender doesn't collide with the
    // persistent listener on the same topic.
    const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const signal = supabase.channel(`voice-control:${user.id}:${suffix}`);
    return new Promise<void>((resolve) => {
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        try { supabase.removeChannel(signal); } catch {}
        resolve();
      };
      // Hard timeout in case SUBSCRIBED never fires (network blip).
      const hardTimer = setTimeout(cleanup, 2500);
      signal.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          signal.send({
            type: "broadcast",
            event: "hangup",
            payload: { exceptDeviceId: DEVICE_ID, conversationId: target },
          }).finally(() => {
            setTimeout(() => { clearTimeout(hardTimer); cleanup(); }, 300);
          });
        }
      });
    });
  }, [user?.id, elsewhere?.conversationId]);

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

  // v0.4.0: read live call state via refs so every mute/state change doesn't
  // tear down & rebuild the voice-control listener (which was creating a
  // window where remote-hangup broadcasts could be dropped).
  const activeCallRef = useRef(activeCall);
  const groupActiveRef = useRef(groupCall.activeCall);
  const endCallRef = useRef(endCall);
  const leaveCallRef = useRef(groupCall.leaveCall);
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);
  useEffect(() => { groupActiveRef.current = groupCall.activeCall; }, [groupCall.activeCall]);
  useEffect(() => { endCallRef.current = endCall; }, [endCall]);
  useEffect(() => { leaveCallRef.current = groupCall.leaveCall; }, [groupCall.leaveCall]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`voice-control:${user.id}`);
    ch.on("broadcast", { event: "hangup" }, ({ payload }) => {
      if (payload?.exceptDeviceId === DEVICE_ID) return;
      const targetConv = payload?.conversationId as string | undefined;
      const localActive = activeCallRef.current;
      const localGroup = groupActiveRef.current;
      if (localActive) {
        if (targetConv && targetConv === localActive.conversationId) endCallRef.current?.();
        return;
      }
      if (localGroup) {
        if (targetConv && targetConv === localGroup.conversationId) leaveCallRef.current?.();
        return;
      }
    }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);
}
