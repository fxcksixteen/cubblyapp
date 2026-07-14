/**
 * Global realtime reconnect watchdog.
 */

import { supabase } from "@/integrations/supabase/client";

type SupabaseChannel = ReturnType<typeof supabase.channel>;

const log = (...args: unknown[]) => {
  // eslint-disable-next-line no-console
  console.log("[Realtime]", ...args);
};

/** Remove every cached channel whose topic matches `realtime:<name>`. */
export function removeChannelByTopic(name: string) {
  const topic = name.startsWith("realtime:") ? name : `realtime:${name}`;
  try {
    const existing: SupabaseChannel[] = (supabase as any).getChannels?.() || [];
    for (const ch of existing) {
      if ((ch as any)?.topic === topic) {
        try { supabase.removeChannel(ch); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
}

/**
 * Subscribe with auto-reconnect on terminal errors.
 */
export function subscribeWithReconnect(
  topicForCleanup: string,
  build: () => SupabaseChannel,
): () => void {
  let cancelled = false;
  let attempt = 0;
  let current: SupabaseChannel | null = null;
  let timer: number | null = null;
  let intentionalCloseUntil = 0;
  let lastStatusLog = "";

  const logStatus = (status: string, err?: unknown) => {
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
    const key = `${status}:${message}`;
    if (status === "CLOSED" && key === lastStatusLog) return;
    lastStatusLog = key;
    log(`channel "${topicForCleanup}" status=${status}${message ? ` (${message})` : ""}`);
  };

  const teardownCurrent = () => {
    if (current) {
      const toRemove = current;
      current = null;
      intentionalCloseUntil = Date.now() + 1200;
      try { supabase.removeChannel(toRemove); } catch { /* ignore */ }
    }
    // Also ensure no other instances of this topic are lingering in the client cache
    removeChannelByTopic(topicForCleanup);
  };

  const scheduleReconnect = (reason: string) => {
    if (cancelled) return;
    if (timer) return;
    attempt += 1;
    const base = Math.min(15_000, 500 * 2 ** Math.min(attempt, 6));
    const delay = Math.floor(base * (0.75 + Math.random() * 0.5));
    log(`channel "${topicForCleanup}" needs reconnect (${reason}) — retrying in ${delay}ms (attempt ${attempt})`);
    timer = window.setTimeout(() => {
      timer = null;
      if (cancelled) return;
      teardownCurrent();
      start();
    }, delay);
  };

  const start = () => {
    if (cancelled) return;
    teardownCurrent();
    let ch: SupabaseChannel;
    try {
      ch = build();
    } catch (e) {
      log(`build() threw for "${topicForCleanup}":`, e);
      scheduleReconnect("build-threw");
      return;
    }
    current = ch;
    const subscribedAt = Date.now();
    let everSubscribed = false;

    try {
      ch.subscribe((status, err) => {
        if (cancelled || ch !== current) return;
        logStatus(status, err);
        if (status === "SUBSCRIBED") {
          attempt = 0;
          everSubscribed = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (status === "CLOSED" && Date.now() < intentionalCloseUntil) {
            return;
          }
          // Ignore the CLOSED that fires synchronously during the rebuild
          // itself. Only treat it as a real failure if we've been alive 
          // long enough OR already reached SUBSCRIBED before.
          if (status === "CLOSED" && !everSubscribed && Date.now() - subscribedAt < 2000) {
            return;
          }
          scheduleReconnect(status);
        }
      });
    } catch (e) {
      log(`subscribe() threw for "${topicForCleanup}":`, e);
      scheduleReconnect("subscribe-threw");
    }
  };

  start();

  const onWake = () => {
    if (cancelled) return;
    if (timer) {
      window.clearTimeout(timer);
      timer = null;
      scheduleReconnect("global-wake");
    }
  };
  window.addEventListener("cubbly:realtime-wake", onWake);

  return () => {
    cancelled = true;
    if (timer) { window.clearTimeout(timer); timer = null; }
    window.removeEventListener("cubbly:realtime-wake", onWake);
    teardownCurrent();
  };
}

let watchdogInstalled = false;

export function installRealtimeWatchdog() {
  if (watchdogInstalled || typeof window === "undefined") return;
  watchdogInstalled = true;

  let lastWakeAt = 0;
  const fireWake = (reason: string) => {
    const now = Date.now();
    if (now - lastWakeAt < 10_000) return;
    lastWakeAt = now;
    log(`watchdog wake (${reason}) — pinging realtime`);
    try {
      const realtime: any = (supabase as any).realtime;
      const isOpen = realtime?.isConnected?.() ?? realtime?.conn?.readyState === 1;
      if (!isOpen) {
        try { realtime?.disconnect?.(); } catch { /* ignore */ }
        try { realtime?.connect?.(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    try { window.dispatchEvent(new Event("cubbly:realtime-wake")); } catch { /* ignore */ }
  };

  window.addEventListener("online", () => fireWake("online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fireWake("visible");
  });
  window.addEventListener("focus", () => fireWake("focus"));

  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    try {
      const realtime: any = (supabase as any).realtime;
      const isOpen = realtime?.isConnected?.() ?? realtime?.conn?.readyState === 1;
      if (!isOpen) fireWake("interval-dead-socket");
    } catch { /* ignore */ }
  }, 30_000);

  log("watchdog installed");
}
