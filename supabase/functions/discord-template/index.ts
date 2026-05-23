// Fetches a public Discord guild template by code or URL and returns the
// serialized template payload. Runs server-side to avoid CORS, and to
// insulate the client from Discord API quirks/rate-limit headers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractCode(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  const m = trimmed.match(/(?:template\/|discord\.new\/)?([a-zA-Z0-9]{6,32})$/);
  return m?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  // Require an authenticated Cubbly user — prevents abuse as an open Discord proxy.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: authErr } = await sb.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (authErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  try {
    const { input } = await req.json();
    const code = extractCode(input);
    if (!code) {
      return new Response(JSON.stringify({ error: "Invalid template link or code" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(`https://discord.com/api/v10/guilds/templates/${code}`);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: "Template not found" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const data = await r.json();
    const guild = data?.serialized_source_guild ?? {};
    const channels = (guild.channels ?? []) as Array<{
      id: number;
      name: string;
      type: number;
      parent_id: number | null;
      position: number;
    }>;
    const categories = new Map<number, string>();
    for (const c of channels) {
      if (c.type === 4) categories.set(c.id, c.name);
    }
    const normalized = channels
      .filter((c) => c.type === 0 || c.type === 2 || c.type === 5)
      .map((c) => ({
        name: c.name,
        kind: c.type === 2 ? "voice" : "text",
        category: c.parent_id != null ? categories.get(c.parent_id) ?? null : null,
        position: c.position,
      }));
    return new Response(
      JSON.stringify({
        name: data?.name ?? guild.name ?? "Imported server",
        description: data?.description ?? null,
        icon_hash: guild.icon_hash ?? null,
        usage_count: data?.usage_count ?? 0,
        channels: normalized,
      }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Failed" }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
