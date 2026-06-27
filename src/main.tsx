import { createRoot } from "react-dom/client";
import { useState } from "react";
import App from "./App.tsx";
import LoadingSplash from "./components/app/LoadingSplash";
import ErrorBoundary from "./components/ErrorBoundary";
import { preloadAllSounds } from "./lib/sounds";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";
import { CURRENT_VERSION } from "./lib/changelog";
import { installRealtimeWatchdog } from "./lib/realtimeReconnect";

// Register the service worker for PWA + push (skipped inside Lovable preview iframe).
registerServiceWorker();

// Install the realtime reconnect watchdog so presence + postgres_changes
// callbacks never get stuck after a network blip, tab wake or socket drop.
installRealtimeWatchdog();

const APP_VERSION = CURRENT_VERSION;
console.log(`%c🧸 Cubbly v${APP_VERSION} (pre-alpha)`, "color: hsl(32, 80%, 50%); font-weight: bold; font-size: 14px;");

// In Electron, also log the REAL packaged app version so we can immediately
// tell when an old installer is still running stale code.
const electronApi = (window as any).electronAPI;
if (electronApi?.getAppVersion) {
  electronApi.getAppVersion().then((v: string | null) => {
    console.log(
      `%c🖥  Electron desktop build: v${v || "unknown"}  (renderer expects v${APP_VERSION})`,
      "color: hsl(200, 80%, 55%); font-weight: bold;"
    );
    if (v && v !== APP_VERSION) {
      console.warn(`[cubbly] Desktop build mismatch — installed=${v}, renderer=${APP_VERSION}. Reinstall the latest .exe.`);
    }
  });
}

// v0.3.21: when hardware acceleration is OFF (Electron flag), auto-apply a
// `cubbly-low-power` class to <html> so we can disable heavy backdrop-blurs,
// shadows, and decorative animations across the app via CSS. Massive perf win
// on machines where users already turned HA off because the app was laggy.
if (electronApi?.getHardwareAcceleration) {
  electronApi.getHardwareAcceleration().then((on: boolean) => {
    if (on === false) {
      document.documentElement.classList.add("cubbly-low-power");
      console.log("[cubbly] low-power mode ON (hardware acceleration disabled)");
    }
  }).catch(() => {});
}

// Preload notification sounds in the background
preloadAllSounds();

// ---- Chunk-load failure recovery ----
// When a deploy ships new JS but the browser still has an old index.html cached,
// dynamic chunk imports start 404'ing and React renders nothing → grey screen.
// We catch those errors globally and force ONE reload (sessionStorage flag
// prevents reload loops if the failure isn't transient).
const RELOAD_FLAG = "__cubbly_chunk_reload";
function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as any)?.message || String(err);
  const name = (err as any)?.name || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}
function tryRecoverFromChunkError(err: unknown) {
  if (!isChunkLoadError(err)) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried — stop the loop
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch { /* ignore */ }
  console.warn("[cubbly] chunk-load failure detected, reloading once:", err);
  window.location.reload();
}
window.addEventListener("error", (e) => tryRecoverFromChunkError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => tryRecoverFromChunkError(e.reason));
// Clear the flag after a successful render (give React 5s to mount)
setTimeout(() => {
  try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
}, 5000);

const Root = () => {
  const [splashDone, setSplashDone] = useState(false);
  return (
    <ErrorBoundary>
      <App />
      {!splashDone && <LoadingSplash onComplete={() => setSplashDone(true)} />}
    </ErrorBoundary>
  );
};

createRoot(document.getElementById("root")!).render(<Root />);
