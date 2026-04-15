import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const GIPHY_API_KEY = Deno.env.get("GIPHY_API_KEY");
  if (!GIPHY_API_KEY) {
    return new Response(JSON.stringify({ error: "GIPHY_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { query, limit = 20, offset = 0, type = "search" } = await req.json();

    let url: string;
    if (type === "trending" || !query) {
      url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg-13`;
    } else if (type === "categories") {
      url = `https://api.giphy.com/v1/gifs/categories?api_key=${GIPHY_API_KEY}`;
    } else {
      url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=pg-13`;
    }

    const response = await fetch(url);
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Giphy API error:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch GIFs" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
