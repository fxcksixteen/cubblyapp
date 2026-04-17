/**
 * PWA / service worker registration with safety guards for Lovable preview.
 *
 * - Skips registration entirely when running inside an iframe or on a Lovable
 *   preview host (prevents stale content + cache pollution in the editor).
 * - In production deployed environments, registers `/sw.js` (built from
 *   `src/sw.ts` by vite-plugin-pwa).
 */

const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost = () => {
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com") || h.includes("lovable.app");
};

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  if (isInIframe || isPreviewHost()) {
    // Defensive cleanup so a previously-registered SW can't keep serving stale content.
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch { /* ignore */ }
    return null;
  }

  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return reg;
  } catch (e) {
    console.warn("[pwa] SW registration failed:", e);
    return null;
  }
}

export function isStandalonePWA(): boolean {
  if (typeof window === "undefined") return false;
  if ((window.navigator as any).standalone === true) return true;
  try { return window.matchMedia("(display-mode: standalone)").matches; } catch { return false; }
}
