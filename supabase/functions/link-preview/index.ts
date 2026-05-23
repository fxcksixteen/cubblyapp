// Server-side OG/Twitter card scraper. Runs in the edge (no CORS issues, hides user IP).
// Returns { title, description, image, siteName } when found.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pickMeta(html: string, ...names: string[]): string | undefined {
  for (const name of names) {
    // property="og:title" content="..."  OR  name="description" content="..."
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`,
      "i",
    );
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1]);
    // content first, attribute second order
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`,
      "i",
    );
    const m2 = html.match(re2);
    if (m2?.[1]) return decodeEntities(m2[1]);
  }
  return undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function pickTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? decodeEntities(m[1].trim()) : undefined;
}

function absolutize(url: string, base: string): string {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

function ipIsPrivate(ip: string): boolean {
  // IPv6 loopback / link-local / unique-local / mapped IPv4
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  if (v6.startsWith("::ffff:")) return ipIsPrivate(v6.slice(7));
  const parts = ip.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => isNaN(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

async function isPrivateHost(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  // Literal IPs in URLs
  if (/^[0-9.]+$/.test(host) || host.includes(":")) return ipIsPrivate(host);
  try {
    const records = await Deno.resolveDns(host, "A").catch(() => [] as string[]);
    const records6 = await Deno.resolveDns(host, "AAAA").catch(() => [] as string[]);
    for (const ip of [...records, ...records6]) {
      if (ipIsPrivate(ip)) return true;
    }
  } catch {
    return true; // resolution failed — treat as unsafe
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Require auth — prevents this from being abused as an open proxy.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "missing url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: "invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "unsupported protocol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (await isPrivateHost(parsed.hostname)) {
      return new Response(JSON.stringify({ error: "blocked host" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch with a sane UA + 5s timeout, cap body to 512KB.
    // Manually follow up to 5 redirects, validating each hop against the SSRF block list.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    let currentUrl = parsed.toString();
    try {
      let redirects = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        res = await fetch(currentUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; CubblyBot/1.0; +https://cubbly.app)",
            Accept: "text/html,application/xhtml+xml",
          },
          redirect: "manual",
          signal: controller.signal,
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("location");
          if (!loc || ++redirects > 5) break;
          const next = new URL(loc, currentUrl);
          if (next.protocol !== "http:" && next.protocol !== "https:") break;
          if (await isPrivateHost(next.hostname)) {
            return new Response(JSON.stringify({ error: "blocked redirect host" }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          currentUrl = next.toString();
          continue;
        }
        break;
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `upstream ${res.status}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read up to ~512KB of body (most OG tags appear in the first 64KB).
    const reader = res.body?.getReader();
    if (!reader) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 512 * 1024;
    while (total < MAX) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    try {
      await reader.cancel();
    } catch {}
    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      chunks.length === 1 ? chunks[0] : (() => {
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        return out;
      })(),
    );

    const title = pickMeta(html, "og:title", "twitter:title") || pickTitle(html);
    const description = pickMeta(html, "og:description", "twitter:description", "description");
    let image = pickMeta(html, "og:image", "twitter:image", "twitter:image:src");
    const siteName = pickMeta(html, "og:site_name") || parsed.hostname.replace(/^www\./, "");
    if (image) image = absolutize(image, parsed.toString());

    return new Response(
      JSON.stringify({ title, description, image, siteName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[link-preview] error:", e);
    return new Response(JSON.stringify({ error: "Failed to fetch preview" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
