import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Electron loads via file:// and needs relative asset paths.
  // Web/PWA needs absolute "/" so deep links like /@me/online resolve assets correctly
  // (relative ./assets/... breaks iOS Home Screen PWA at non-root start_url).
  // Detect electron-builder too — it spawns vite build without our env var, which
  // is exactly what shipped a broken 0.2.4 (absolute /assets paths under file://).
  base:
    process.env.BUILD_TARGET === "electron" ||
    process.env.npm_lifecycle_event === "build:electron" ||
    !!process.env.ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES ||
    process.argv.some((a) => a.includes("electron-builder"))
      ? "./"
      : "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false, // we register manually with iframe/preview guard
      manifest: false, // we ship our own /manifest.webmanifest
      devOptions: { enabled: false },
      injectManifest: {
        injectionPoint: undefined,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
