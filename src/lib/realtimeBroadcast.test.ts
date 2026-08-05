/**
 * Behavioural regression tests for the incoming-call delivery bug (v0.4.27).
 *
 * These drive the REAL @supabase/supabase-js client — no mocking of channel(),
 * removeChannel(), or the channel registry — so they exercise the exact
 * semantics that caused the bug:
 *
 *   RealtimeClient.channel(topic) dedupes by topic and returns the LIVE
 *   instance, so a trailing removeChannel() on a "temporary" channel tore down
 *   the app's own long-lived listener.
 *
 * Only the network edges are stubbed (fetch for the REST broadcast endpoint,
 * WebSocket so nothing dials out).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = "https://example.supabase.co";
const KEY = "test-anon-key";

let client: SupabaseClient;
let fetchCalls: Array<{ url: string; body: any; headers: Record<string, string> }>;

/** A socket stub that never dials out but lets channels reach "joined". */
class FakeWebSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  constructor(public url: string) { setTimeout(() => this.onopen?.({}), 0); }
  send() { /* swallow */ }
  close() { this.onclose?.({}); }
}

beforeEach(() => {
  fetchCalls = [];
  const fakeFetch = vi.fn(async (url: any, opts: any = {}) => {
    fetchCalls.push({
      url: String(url),
      body: opts.body ? JSON.parse(opts.body) : null,
      headers: opts.headers || {},
    });
    return {
      ok: true, status: 202, statusText: "Accepted",
      json: async () => ({}), body: { cancel: async () => {} },
    } as any;
  });
  client = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fakeFetch as any },
    // RealtimeClient resolves its OWN fetch (see _resolveFetch); without this
    // it falls through to jsdom's, whose AbortSignal class doesn't match the
    // one _fetchWithTimeout constructs.
    realtime: { transport: FakeWebSocket as any, heartbeatIntervalMs: 1e9, fetch: fakeFetch as any },
  });
});

afterEach(() => { vi.restoreAllMocks(); });

const topics = () => client.getChannels().map((c) => c.topic);

describe("the bug: channel() dedupes by topic", () => {
  it("hands back the SAME instance for a topic the app already holds", () => {
    const longLived = client.channel("voice-global:user-1");
    const looksTemporary = client.channel("voice-global:user-1");
    // This identity is the entire root cause.
    expect(looksTemporary).toBe(longLived);
  });

  it("OLD PATTERN: removeChannel on the 'temporary' channel destroys the live listener", async () => {
    const longLived = client.channel("voice-global:user-1");
    longLived.on("broadcast", { event: "incoming-call" }, () => {});
    longLived.subscribe();
    expect(topics()).toContain("realtime:voice-global:user-1");

    // What broadcastIncomingCallDismiss used to do on decline/accept.
    const temp = client.channel("voice-global:user-1");
    await client.removeChannel(temp);

    // The app's own incoming-call listener is gone -> no further calls ring.
    expect(topics()).not.toContain("realtime:voice-global:user-1");
  });
});

describe("the fix: broadcastToTopic never joins and never removes", () => {
  /** Mirror of lib/realtimeBroadcast.broadcastToTopic against the test client. */
  const broadcastToTopic = async (topic: string, event: string, payload: any) => {
    const ch: any = client.channel(topic);
    await ch.httpSend(event, payload);
    return { ok: true };
  };

  it("leaves the long-lived listener subscribed after a dismiss broadcast", async () => {
    const longLived = client.channel("voice-global:user-1");
    longLived.on("broadcast", { event: "incoming-call" }, () => {});
    longLived.subscribe();

    await broadcastToTopic("voice-global:user-1", "incoming-call-dismiss", { userId: "user-1" });

    // Still registered, still the same instance, bindings intact.
    expect(topics()).toContain("realtime:voice-global:user-1");
    expect(client.channel("voice-global:user-1")).toBe(longLived);
    expect(fetchCalls.at(-1)?.body?.messages?.[0]?.event).toBe("incoming-call-dismiss");
  });

  it("survives repeated dismisses — the reported 'stops ringing after one decline'", async () => {
    const longLived = client.channel("voice-global:user-1");
    longLived.on("broadcast", { event: "incoming-call" }, () => {});
    longLived.subscribe();

    for (let i = 0; i < 5; i++) {
      await broadcastToTopic("voice-global:user-1", "incoming-call-dismiss", { n: i });
    }
    expect(topics()).toContain("realtime:voice-global:user-1");
    expect(client.channel("voice-global:user-1")).toBe(longLived);
  });

  it("sends to the right topic with apikey auth", async () => {
    await broadcastToTopic("voice-global:peer-2", "incoming-call", { targetId: "peer-2" });
    const call = fetchCalls.at(-1)!;
    expect(call.url).toContain("/realtime/v1/api/broadcast");
    expect(call.body.messages[0].topic).toBe("voice-global:peer-2");
    expect(call.body.messages[0].private).toBe(false);
    expect(call.headers.apikey).toBe(KEY);
  });
});

describe("topic separation: voice vs group", () => {
  it("gives the two providers independent channel instances", () => {
    const voice = client.channel("voice-global:user-1");
    const group = client.channel("group-global:user-1");
    expect(voice).not.toBe(group);
  });

  it("tearing down the voice listener no longer kills group ringing", async () => {
    const voice = client.channel("voice-global:user-1");
    voice.on("broadcast", { event: "incoming-call" }, () => {});
    voice.subscribe();
    const group = client.channel("group-global:user-1");
    group.on("broadcast", { event: "group-incoming-call" }, () => {});
    group.subscribe();

    // VoiceContext's effect re-runs (its deps include setupSignaling) and
    // legitimately removes the topic it owns.
    await client.removeChannel(voice);

    // Group ringing must be unaffected. Under the old shared topic this failed.
    expect(topics()).toContain("realtime:group-global:user-1");
    expect(client.channel("group-global:user-1")).toBe(group);
  });
});
