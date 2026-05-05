import { supabase } from "@/integrations/supabase/client";

const KEY = "cubbly:session-id";

export function getSessionKey(): string {
  try {
    let v = localStorage.getItem(KEY);
    if (!v) {
      v = (crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, v);
    }
    return v;
  } catch {
    return `s-${Date.now()}`;
  }
}

function detectLabel(): { label: string; platform: string; isDesktop: boolean; isMobile: boolean } {
  const isDesktop = !!(typeof window !== "undefined" && (window as any).electronAPI?.isElectron);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  let os = "Unknown";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);
  let browser = "Browser";
  if (isDesktop) browser = "Cubbly Desktop";
  else if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  return { label: `${browser} on ${os}`, platform: os, isDesktop, isMobile };
}

export async function registerSession(userId: string) {
  const session_key = getSessionKey();
  const { label, platform, isDesktop, isMobile } = detectLabel();
  try {
    await supabase.from("user_sessions").upsert(
      {
        user_id: userId,
        session_key,
        device_label: label,
        user_agent: navigator.userAgent,
        platform,
        is_desktop_app: isDesktop,
        is_mobile: isMobile,
        last_seen_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "user_id,session_key" }
    );
  } catch {}
}

export async function unregisterSession(userId: string) {
  try {
    await supabase
      .from("user_sessions")
      .delete()
      .eq("user_id", userId)
      .eq("session_key", getSessionKey());
  } catch {}
}
