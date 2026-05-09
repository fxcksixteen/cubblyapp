/**
 * Global realtime reconnect watchdog.
 *
 * Why this exists:
 *   Supabase Realtime channels can silently die in three ways that all
 *   produce "status indicators stuck offline / no live updates" reports:
 *     1. The WebSocket transport itself drops (network blip, sleep/resume,
 *        proxy idle-timeout). The client emits "CHANNEL_ERROR" or "CLOSED"
 *        on every channel.
 *     2. The tab gets backgrounded long enough that the browser kills
 *        timers; on visibilitychange we wake up but channels still think
 *        they're subscribed even though the socket is dead.
 *     3. supabase-js holds onto a cached channel after a callback throws,
 *        and any later .on() call errors with "cannot add ... callbacks
 *        after subscribe()".
 *
 * Strategy:
 *   - `installRealtimeWatchdog()` (called once from <App />) listens to
 *     window online/offline + visibilitychange + the realtime socket's own
 *     close/error events. When trouble is detected it calls
 *     `supabase.realtime.disconnect()` then `.connect()`. supabase-js will
 *     auto-rejoin every still-mounted channel.
 *   - `subscribeWithReconnect(channel, factory)` wraps `.subscribe()` and,
 *     on a non-SUBSCRIBED terminal status (CHANNEL_ERROR / TIMED_OUT /
 *     CLOSED), removes the channel and rebuilds it via `factory()` after
 *     an exponential backoff. This survives the case where the realtime
 *     socket is up but a single channel has gotten wedged.
 *   - `removeChannelByTopic(name)` clears any cached channel for a topic
 *     before recreating one — fixes the "callbacks after subscribe" throw.
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
 *
 * @param build  Factory that creates a brand new channel + attaches all
 *               .on() handlers. MUST NOT call .subscribe() itself.
 * @returns      A `cleanup()` you should call on unmount. It tears down
 *               whatever channel is currently live and cancels pending
 *               reconnect timers.
 */
export function subscribeWithReconnect(
  topicForCleanup: string,
  build: () => SupabaseChannel,
): () => void {
  let cancelled = false;
  let attempt = 0;
  let current: SupabaseChannel | null = null;
  let timer: number | null = null;

  const teardownCurrent = () => {
    if (current) {
      try { supabase.removeChannel(current); } catch { /* ignore */ }
      current = null;
    }
  };

  const scheduleReconnect = (reason: string) => {
    if (cancelled) return;
    attempt += 1;
    // Exponential backoff capped at 15s, with ±25% jitter.
    const base = Math.min(15_000, 500 * 2 ** Math.min(attempt, 6));
    const delay = Math.floor(base * (0.75 + Math.random() * 0.5));
    log(`channel "${topicForCleanup}" needs reconnect (${reason}) — retrying in ${delay}ms (attempt ${attempt})`);
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (cancelled) return;
      teardownCurrent();
      // Make sure no stale cached channel keeps us from re-attaching .on()s.
      removeChannelByTopic(topicForCleanup);
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
      ch.subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          attempt = 0;
          everSubscribed = true;
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          // Ignore the CLOSED that fires synchronously during the rebuild
          // itself — that's the previous channel tearing down, not a failure
          // of the new one. Only treat it as a real failure if we've either
          // been alive long enough OR already reached SUBSCRIBED before.
          if (status === "CLOSED" && !everSubscribed && Date.now() - subscribedAt < 800) {
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

  // Re-attempt immediately when a global wake-up fires.
  const onWake = () => {
    if (cancelled) return;
    // Light retry — don't reset attempt counter, but kick a reconnect if
    // we've been sitting in a backoff for a while.
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

/**
 * Install global hooks that detect when the realtime socket has gone
 * stale (network change, tab wake, OS sleep/resume) and force the client
 * to reconnect. supabase-js auto-rejoins all live channels after a
 * successful reconnect.
 *
 * Safe to call multiple times — only the first call wires anything up.
 */
export function installRealtimeWatchdog() {
  if (watchdogInstalled || typeof window === "undefined") return;
  watchdogInstalled = true;

  const fireWake = (reason: string) => {
    log(`watchdog wake (${reason}) — pinging realtime`);
    try {
      const realtime: any = (supabase as any).realtime;
      // If the socket isn't open, force a reconnect.
      const isOpen = realtime?.isConnected?.() ?? realtime?.conn?.readyState === 1;
      if (!isOpen) {
        try { realtime?.disconnect?.(); } catch { /* ignore */ }
        try { realtime?.connect?.(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    // Tell every wrapped subscription to reconsider its state.
    try { window.dispatchEvent(new Event("cubbly:realtime-wake")); } catch { /* ignore */ }
  };

  window.addEventListener("online", () => fireWake("online"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fireWake("visible");
  });
  window.addEventListener("focus", () => fireWake("focus"));

  // Periodic safety net: every 30s, if the page is visible but the socket
  // is closed, force a reconnect. Catches the rare case where the browser
  // never fires online/visibility but the socket has died (proxy idle).
  window.setInterval(() => {
    if (document.visibilityState !== "visible") return;
    try {
      const realtime: any = (supabase as any).realtime;
      const isOpen = realtime?.isConnected?.() ?? realtime?.conn?.readyState === 1;
      if (!isOpen) fireWake("interval-dead-socket");
    } catch { /* ignore */ }
  }, 30_000);

  // Hook the realtime client's own onError/onClose so we surface a wake
  // event to every subscription (they'll resubscribe via the wrapper).
  try {
    const realtime: any = (supabase as any).realtime;
    realtime?.onError?.(() => fireWake("socket-error"));
    realtime?.onClose?.(() => fireWake("socket-close"));
  } catch { /* ignore */ }

  log("watchdog installed");
}
