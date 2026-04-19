import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IceServer = {
  urls: string;
  username?: string;
  credential?: string;
};

const turnHostsByRegion: Record<string, string> = {
  "eu-west": "europe.relay.metered.ca",
  "eu-central": "europe.relay.metered.ca",
  "us-east": "a.relay.metered.ca",
  "us-west": "a.relay.metered.ca",
  "south-america": "a.relay.metered.ca",
  "asia-east": "asia.relay.metered.ca",
  "asia-south": "asia.relay.metered.ca",
  "australia": "asia.relay.metered.ca",
};

function getOrderedTurnHosts(preferredRegion?: string | null) {
  const fallbackHosts = [
    "europe.relay.metered.ca",
    "a.relay.metered.ca",
    "asia.relay.metered.ca",
  ];

  const preferredHost = preferredRegion
    ? turnHostsByRegion[preferredRegion.trim().toLowerCase()]
    : undefined;

  if (!preferredHost) return fallbackHosts;
  return [preferredHost, ...fallbackHosts.filter((host) => host !== preferredHost)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const preferredRegion = typeof body?.preferredRegion === "string" ? body.preferredRegion : undefined;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const turnUsername = Deno.env.get("TURN_USERNAME");
    const turnCredential = Deno.env.get("TURN_CREDENTIAL");

    // STUN servers — geographically diverse so the browser picks the closest.
    // Cloudflare's STUN is anycast → routes to the nearest PoP automatically (lowest RTT for everyone).
    const iceServers: IceServer[] = [
      { urls: "stun:stun.cloudflare.com:3478" },
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ];

    // TURN relays — multi-region. metered.ca routes by hostname:
    //   a.relay.metered.ca   = US
    //   europe.relay.metered.ca = EU (Frankfurt) ← matters for ME/Africa/EU users
    //   asia.relay.metered.ca   = Asia
    // The browser's ICE agent will pick the lowest-latency one automatically.
    if (turnUsername && turnCredential) {
      const regions = getOrderedTurnHosts(preferredRegion);
      for (const host of regions) {
        iceServers.push(
          { urls: `turn:${host}:80`, username: turnUsername, credential: turnCredential },
          { urls: `turn:${host}:80?transport=tcp`, username: turnUsername, credential: turnCredential },
          { urls: `turn:${host}:443`, username: turnUsername, credential: turnCredential },
          { urls: `turns:${host}:443?transport=tcp`, username: turnUsername, credential: turnCredential },
        );
      }
    }

    return new Response(JSON.stringify({ iceServers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Internal error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
