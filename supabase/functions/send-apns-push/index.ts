// Sends a push notification to a user's iOS devices via Apple Push Notification service (APNs).
//
// Body: { user_id: string, title: string, body: string, conversation_id?: string, thread_id?: string }
//
// Required secrets (configure in Lovable Cloud → Backend → Secrets):
//   APNS_KEY_P8        — contents of the .p8 file from developer.apple.com
//                        (the whole file, including BEGIN/END PRIVATE KEY lines)
//   APNS_KEY_ID        — 10-character key ID shown next to the .p8 in Apple's console
//   APNS_TEAM_ID       — 10-character Apple Developer team ID (top-right of the console)
//   APNS_BUNDLE_ID     — defaults to "app.cubbly.ios" if not set
//
// Until those secrets are filled in, the function returns 200 with `skipped: true`
// so the message-trigger never errors.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APNS_KEY_P8 = Deno.env.get("APNS_KEY_P8") || "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") || "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") || "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") || "app.cubbly.ios";

// ---- JWT signing helpers (ES256 for APNs) ----------------------------------

function base64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedJwt: { token: string; exp: number } | null = null;

async function makeApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // APNs caches JWTs up to ~55 minutes. Re-sign every 45 to stay safe.
  if (cachedJwt && cachedJwt.exp - now > 600) return cachedJwt.token;

  const header = { alg: "ES256", kid: APNS_KEY_ID };
  const payload = { iss: APNS_TEAM_ID, iat: now };
  const enc = new TextEncoder();
  const headerB64 = base64url(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(APNS_KEY_P8),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signingInput),
  );
  const signature = base64url(new Uint8Array(sigBuf));
  const token = `${signingInput}.${signature}`;
  cachedJwt = { token, exp: now + 45 * 60 };
  return token;
}

// ---- HTTP/2 send via fetch (Deno supports HTTP/2 to APNs out of the box) ---

async function sendOne(opts: {
  host: string;
  token: string;
  jwt: string;
  payload: Record<string, unknown>;
  threadId?: string;
}): Promise<{ ok: boolean; status: number; reason?: string }> {
  const res = await fetch(`https://${opts.host}/3/device/${opts.token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${opts.jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(opts.threadId ? { "apns-collapse-id": opts.threadId.slice(0, 64) } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(opts.payload),
  });
  if (res.ok) return { ok: true, status: res.status };
  let reason: string | undefined;
  try {
    const j = await res.json();
    reason = j?.reason;
  } catch { /* ignore */ }
  return { ok: false, status: res.status, reason };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, title, body, conversation_id, thread_id } = await req.json();
    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!APNS_KEY_P8 || !APNS_KEY_ID || !APNS_TEAM_ID) {
      // Secrets not yet configured — silently skip so the message trigger never errors.
      return new Response(JSON.stringify({ skipped: true, reason: "APNs secrets missing" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: subs, error } = await admin
      .from("apns_subscriptions")
      .select("id, device_token, environment, bundle_id")
      .eq("user_id", user_id);
    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jwt = await makeApnsJwt();
    const payload = {
      aps: {
        alert: { title, body: body || "" },
        sound: "default",
        "thread-id": thread_id || (conversation_id ? `dm:${conversation_id}` : undefined),
        "mutable-content": 1,
      },
      conversation_id: conversation_id || null,
    };

    const dead: string[] = [];
    let sent = 0;

    await Promise.all(
      subs.map(async (s: any) => {
        // Try the env we registered with first; if APNs returns BadDeviceToken,
        // fall back to the other env (handles local-Xcode→TestFlight mismatch).
        const primary = s.environment === "production"
          ? "api.push.apple.com"
          : "api.sandbox.push.apple.com";
        const fallback = s.environment === "production"
          ? "api.sandbox.push.apple.com"
          : "api.push.apple.com";

        let result = await sendOne({ host: primary, token: s.device_token, jwt, payload, threadId: thread_id });
        if (!result.ok && result.reason === "BadDeviceToken") {
          result = await sendOne({ host: fallback, token: s.device_token, jwt, payload, threadId: thread_id });
        }
        if (result.ok) {
          sent++;
        } else if (result.reason === "Unregistered" || result.reason === "BadDeviceToken") {
          dead.push(s.id);
        } else {
          console.warn("[apns] send failed:", result.status, result.reason);
        }
      }),
    );

    if (dead.length) {
      await admin.from("apns_subscriptions").delete().in("id", dead);
    }

    return new Response(JSON.stringify({ sent, removed: dead.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[apns] error:", e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
