/**
 * Web Push subscription helper.
 *
 * Subscribes the active service worker to push notifications using our VAPID
 * public key, then stores the subscription in the `push_subscriptions` table
 * so the backend edge function can deliver pushes to this device.
 */
import { supabase } from "@/integrations/supabase/client";

// Public key — safe to ship to the browser. (The private key lives only in the edge function.)
const VAPID_PUBLIC_KEY = "BCubblyPlaceholderReplacedAtRuntime"; // unused — we fetch from edge fn

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getVapidPublicKey(): Promise<string | null> {
  // Fetched from the edge function so we never have to hardcode/rebuild the
  // frontend if the key ever rotates.
  try {
    const { data, error } = await supabase.functions.invoke("get-vapid-public-key");
    if (error) throw error;
    return (data as any)?.publicKey || null;
  } catch (e) {
    console.warn("[webPush] failed to fetch VAPID public key:", e);
    return null;
  }
}

export async function subscribeToPush(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return false;

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return false;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (e) {
      console.warn("[webPush] subscribe failed:", e);
      return false;
    }
  }

  const json = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    console.warn("[webPush] upsert failed:", error);
    return false;
  }
  return true;
}
