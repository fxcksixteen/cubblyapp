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

/** Direct image URLs for popular games & software. Keyed by lowercased name OR process name. */
export const CURATED_ICONS: Record<string, string> = {
  // --- Riot ---
  "valorant": "https://cdn2.steamgriddb.com/icon_thumb/8c2f1d3acb91eed6d9f55ac41bcc41d7.png",
  "valorant-win64-shipping": "https://cdn2.steamgriddb.com/icon_thumb/8c2f1d3acb91eed6d9f55ac41bcc41d7.png",
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
  "fortnite": "https://cdn.simpleicons.org/epicgames/313131",
  "fortniteclient-win64-shipping": "https://cdn.simpleicons.org/epicgames/313131",
  "epic games launcher": "https://cdn.simpleicons.org/epicgames/313131",
  "epicgameslauncher": "https://cdn.simpleicons.org/epicgames/313131",
  "rocket league": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",
  "rocketleague": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",

  // --- Marvel Rivals ---
  "marvel rivals": "https://cdn2.steamgriddb.com/icon_thumb/3b1a87f43db61e70c2b0ed2c4eb1b3df.png",
  "marvel-win64-shipping": "https://cdn2.steamgriddb.com/icon_thumb/3b1a87f43db61e70c2b0ed2c4eb1b3df.png",

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

/** Steam fallback URL — null if no known mapping. */
export function lookupSteamIcon(name?: string | null, processName?: string | null): string | null {
  const candidates = [name, processName].filter(Boolean).map((v) => v!.toLowerCase().trim());
  for (const key of candidates) {
    if (STEAM_APP_IDS[key]) return steamHeaderUrl(STEAM_APP_IDS[key]);
  }
  return null;
}
