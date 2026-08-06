/**
 * Activity icon resolution with a 3-tier fallback chain:
 *   1. Curated hardcoded map (popular games + software)
 *   2. Steam CDN header image (when we know the Steam app id)
 *   3. OS-extracted .exe / .app icon via Electron IPC (Electron only)
 *   4. Final fallback: colored letter tile (handled by <ActivityIcon> component)
 *
 * IMPORTANT: Do NOT use upload.wikimedia.org URLs — Wikimedia blocks hotlinking
 * and returns 429 to non-browser User-Agents (and even browsers eventually).
 * Stick to CDNs that allow hotlinking: SteamGridDB, Steam CDN, simpleicons,
 * cdn.jsdelivr.net (for github raw), etc.
 */
import marvelRivalsIcon from "@/assets/marvel-rivals.png";
import fortniteIconAsset from "@/assets/fortnite.png.asset.json";
import gtaVIconAsset from "@/assets/gta5.png.asset.json";

// Electron loads pages via file:// so root-relative /__l5e/ CDN paths can't
// resolve. Prepend the deployed origin when running in the desktop app so
// asset-pointer icons still load on friend cards / Active Now / chips.
const isElectronRuntime =
  typeof window !== "undefined" && !!(window as any).electronAPI;
const assetUrl = (url: string) =>
  isElectronRuntime && url.startsWith("/") ? `https://web.cubbly.app${url}` : url;
const fortniteIconUrl = assetUrl(fortniteIconAsset.url);
const gtaVIconUrl = assetUrl(gtaVIconAsset.url);

/** Direct image URLs for popular games & software. Keyed by lowercased name OR process name. */
export const CURATED_ICONS: Record<string, string> = {

  // --- Riot ---
  "valorant": "https://cdn.simpleicons.org/valorant/FF4654",
  "valorant-win64-shipping": "https://cdn.simpleicons.org/valorant/FF4654",
  "league of legends": "https://cdn.simpleicons.org/leagueoflegends/C89B3C",
  "leagueclient": "https://cdn.simpleicons.org/leagueoflegends/C89B3C",
  "teamfight tactics": "https://cdn.simpleicons.org/riotgames/D32936",
  "tft": "https://cdn.simpleicons.org/riotgames/D32936",

  // --- Valve / Steam ---
  "steam": "https://cdn.simpleicons.org/steam/FFFFFF",
  "counter-strike 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "cs2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "counter-strike: global offensive": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "csgo": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "dota 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/capsule_184x69.jpg",
  "dota2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/capsule_184x69.jpg",
  "half-life 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/220/capsule_184x69.jpg",
  "hl2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/220/capsule_184x69.jpg",

  // --- Epic / Fortnite ---
  "fortnite": fortniteIconUrl,
  "fortniteclient-win64-shipping": fortniteIconUrl,
  "epic games launcher": "https://cdn.simpleicons.org/epicgames/313131",
  "epicgameslauncher": "https://cdn.simpleicons.org/epicgames/313131",
  "rocket league": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",
  "rocketleague": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",

  // --- Marvel Rivals ---
  "marvel rivals": marvelRivalsIcon,
  "marvelrivals": marvelRivalsIcon,
  "marvel-win64-shipping": marvelRivalsIcon,

  // --- Rockstar ---
  "grand theft auto v": gtaVIconUrl,
  "grand theft auto v enhanced": gtaVIconUrl,
  "grand theft auto v legacy": gtaVIconUrl,
  "gta v": gtaVIconUrl,
  "gta5": gtaVIconUrl,
  "gtav": gtaVIconUrl,
  "gta5_enhanced": gtaVIconUrl,
  "gtavlauncher": gtaVIconUrl,
  "playgtav": gtaVIconUrl,
  "gta online": gtaVIconUrl,
  "fivem": gtaVIconUrl,
  "fivem_gtaprocess": gtaVIconUrl,
  "fivem_b2802_gtaprocess": gtaVIconUrl,
  "ragemp": gtaVIconUrl,
  "altv": gtaVIconUrl,



  // --- Minecraft ---
  "minecraft": "https://cdn.simpleicons.org/minecraft/62B47A",
  "minecraft launcher": "https://cdn.simpleicons.org/minecraft/62B47A",
  "minecraftlauncher": "https://cdn.simpleicons.org/minecraft/62B47A",
  "javaw": "https://cdn.simpleicons.org/minecraft/62B47A",
  "minecraft (prism)": "https://cdn.simpleicons.org/minecraft/62B47A",

  // --- Roblox ---
  "roblox": "https://cdn.simpleicons.org/roblox/FFFFFF",
  "robloxplayerbeta": "https://cdn.simpleicons.org/roblox/FFFFFF",
  "robloxplayer": "https://cdn.simpleicons.org/roblox/FFFFFF",
  "robloxstudiobeta": "https://cdn.simpleicons.org/roblox/FFFFFF",

  // --- Battle.net / Blizzard ---
  "battle.net": "https://cdn.simpleicons.org/battledotnet/00AEFF",
  "world of warcraft": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2456740/capsule_184x69.jpg",
  "wow": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2456740/capsule_184x69.jpg",
  "overwatch 2": "https://cdn2.steamgriddb.com/icon_thumb/0bb4aec1710521c12ee76289d9440817.png",
  "overwatch": "https://cdn2.steamgriddb.com/icon_thumb/0bb4aec1710521c12ee76289d9440817.png",
  "diablo iv": "https://cdn2.steamgriddb.com/icon_thumb/8a8b21b6e90f6b03d1ce3fb4a1f8e81b.png",
  "hearthstone": "https://cdn2.steamgriddb.com/icon_thumb/29d4ab95df58aef2dd24cdaadf1acb1c.png",

  // --- EA / Apex / Call of Duty ---
  "apex legends": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1172470/capsule_184x69.jpg",
  "r5apex": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1172470/capsule_184x69.jpg",
  "apex_legends": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1172470/capsule_184x69.jpg",
  "ea app": "https://cdn.simpleicons.org/ea/FF4747",
  "ea sports fc 24": "https://cdn.simpleicons.org/ea/FF4747",
  "fifa24": "https://cdn.simpleicons.org/ea/FF4747",
  "call of duty": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",
  "call of duty: warzone": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",
  "call of duty: modern warfare": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",
  "warzone": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",
  "modernwarfare": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",
  "cod": "https://cdn2.steamgriddb.com/icon_thumb/41f1f19176d383480afb7d7e7b3a4f56.png",

  // --- Ubisoft ---
  "rainbow six siege": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/359550/capsule_184x69.jpg",
  "rainbow6": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/359550/capsule_184x69.jpg",
  "rainbowsix": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/359550/capsule_184x69.jpg",
  "ubisoft connect": "https://cdn.simpleicons.org/ubisoft/FFFFFF",
  "upc": "https://cdn.simpleicons.org/ubisoft/FFFFFF",

  // --- Indie / popular ---
  "among us": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/945360/capsule_184x69.jpg",
  "amongus": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/945360/capsule_184x69.jpg",
  "terraria": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/105600/capsule_184x69.jpg",
  "stardew valley": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/413150/capsule_184x69.jpg",
  "stardewvalley": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/413150/capsule_184x69.jpg",
  "hollow knight": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/capsule_184x69.jpg",
  "hollow_knight": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/capsule_184x69.jpg",

  // --- Software ---
  "discord": "https://cdn.simpleicons.org/discord/5865F2",
  "spotify": "https://cdn.simpleicons.org/spotify/1DB954",
  "visual studio code": "https://cdn.simpleicons.org/visualstudiocode/007ACC",
  "vscode": "https://cdn.simpleicons.org/visualstudiocode/007ACC",
  "code": "https://cdn.simpleicons.org/visualstudiocode/007ACC",
  "obs": "https://cdn.simpleicons.org/obsstudio/302E31",
  "obs64": "https://cdn.simpleicons.org/obsstudio/302E31",
  "chrome": "https://cdn.simpleicons.org/googlechrome/4285F4",
  "firefox": "https://cdn.simpleicons.org/firefoxbrowser/FF7139",
};

/** Steam app id lookup for known steam games — used to fetch the header image as a fallback. */
export const STEAM_APP_IDS: Record<string, number> = {
  "counter-strike 2": 730,
  "cs2": 730,
  "csgo": 730,
  "counter-strike: global offensive": 730,
  "dota 2": 570,
  "dota2": 570,
  "half-life 2": 220,
  "hl2": 220,
  "rocket league": 252950,
  "rocketleague": 252950,
  "terraria": 105600,
  "stardew valley": 413150,
  "stardewvalley": 413150,
  "hollow knight": 367520,
  "hollow_knight": 367520,
  "team fortress 2": 440,
  "tf2": 440,
  "garry's mod": 4000,
  "gmod": 4000,
  "rust": 252490,
  "the witcher 3": 292030,
  "elden ring": 1245620,
  "cyberpunk 2077": 1091500,
};

/** Steam header image URL for a given app id. */
export const steamHeaderUrl = (appId: number) =>
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_184x69.jpg`;

/**
 * Dynamic Steam library index (desktop only).
 *
 * Electron scans the local Steam install (`libraryfolders.vdf` +
 * `appmanifest_*.acf`) and hands us `{ appId, name, exeNames[] }` for every
 * installed game. We index it by lowercased name and by every executable
 * basename we found inside the install folder, so ANY installed Steam game
 * resolves to its official Steam capsule art with no curated entry needed.
 */
export type SteamLibraryEntry = { appId: number; name: string; exeNames?: string[] };

const steamLibraryIndex = new Map<string, number>();

export function registerSteamLibrary(entries: SteamLibraryEntry[] | null | undefined) {
  if (!Array.isArray(entries)) return;
  for (const entry of entries) {
    if (!entry || !Number.isFinite(entry.appId)) continue;
    const keys = [entry.name, ...(entry.exeNames || [])];
    for (const raw of keys) {
      const key = String(raw || "").toLowerCase().trim().replace(/\.exe$/, "");
      if (key) steamLibraryIndex.set(key, entry.appId);
    }
  }
}

/** Resolve a Steam app id from the scanned library (name or process name). */
export function lookupSteamAppId(name?: string | null, processName?: string | null): number | null {
  const candidates = [name, processName]
    .filter(Boolean)
    .map((v) => v!.toLowerCase().trim().replace(/\.exe$/, ""));
  for (const key of candidates) {
    if (STEAM_APP_IDS[key]) return STEAM_APP_IDS[key];
    const dynamic = steamLibraryIndex.get(key);
    if (dynamic) return dynamic;
  }
  return null;
}

/**
 * Curated icon lookup — checks both the activity name and the process name.
 * Returns null if no curated icon exists.
 */
export function lookupCuratedIcon(name?: string | null, processName?: string | null): string | null {
  const candidates = [name, processName].filter(Boolean).map((v) => v!.toLowerCase().trim());
  for (const key of candidates) {
    if (CURATED_ICONS[key]) return CURATED_ICONS[key];
  }
  return null;
}

/** Steam fallback URL — null if no known mapping (curated map or scanned library). */
export function lookupSteamIcon(name?: string | null, processName?: string | null): string | null {
  const appId = lookupSteamAppId(name, processName);
  return appId ? steamHeaderUrl(appId) : null;
}

