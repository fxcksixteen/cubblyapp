import { createRoot } from "react-dom/client";
import { useState } from "react";
import App from "./App.tsx";
import LoadingSplash from "./components/app/LoadingSplash";
import ErrorBoundary from "./components/ErrorBoundary";
import { preloadAllSounds } from "./lib/sounds";
import { registerServiceWorker } from "./lib/pwa";
import "./index.css";

// Register the service worker for PWA + push (skipped inside Lovable preview iframe).
registerServiceWorker();

const APP_VERSION = "0.2.1";
console.log(`%c🧸 Cubbly v${APP_VERSION} (pre-alpha)`, "color: hsl(32, 80%, 50%); font-weight: bold; font-size: 14px;");

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
