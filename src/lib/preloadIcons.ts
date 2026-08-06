/**
 * Warm every icon asset at app boot so nothing pops in later.
 * Cubbly never lazy-loads icons — panels (settings, shop, honey, gifts) must
 * render with their glyphs already in the browser cache.
 */
const modules = {
  ...import.meta.glob("/src/assets/icons/*.svg", { eager: true, query: "?url", import: "default" }),
  ...import.meta.glob("/src/assets/badges/*.svg", { eager: true, query: "?url", import: "default" }),
  ...import.meta.glob("/src/assets/gems/*.png", { eager: true, query: "?url", import: "default" }),
  ...import.meta.glob("/src/assets/coins/*.png", { eager: true, query: "?url", import: "default" }),
} as Record<string, string>;

let done = false;

export function preloadIcons() {
  if (done || typeof window === "undefined") return;
  done = true;
  const urls = Object.values(modules).filter(Boolean);
  for (const url of urls) {
    const img = new Image();
    img.decoding = "sync";
    (img as any).fetchPriority = "high";
    img.src = url;
  }
}
