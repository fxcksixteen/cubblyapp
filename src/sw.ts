/// <reference lib="webworker" />
/**
 * Cubbly service worker — handles Web Push notifications for iOS PWA users.
 *
 * Activated only in production (see vite.config.ts devOptions: false) and only
 * registered when NOT inside the Lovable preview iframe (see src/lib/pwa.ts).
 */
declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

interface PushPayload {
  title?: string;
  body?: string;
  tag?: string;
  url?: string;
  icon?: string;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {};
  } catch {
    payload = { title: "Cubbly", body: event.data?.text() || "" };
  }

  const title = payload.title || "Cubbly";
  const options: NotificationOptions = {
    body: payload.body || "",
    icon: payload.icon || "/favicon.ico",
    badge: "/favicon.ico",
    tag: payload.tag,
    data: { url: payload.url || "/@me/online" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || "/@me/online";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          (client as WindowClient).navigate(targetUrl).catch(() => {});
          return (client as WindowClient).focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
