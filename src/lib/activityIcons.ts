/**
 * Activity icon resolution with a 3-tier fallback chain:
 *   1. Curated hardcoded map (popular games + software)
 *   2. Steam CDN header image (when we know the Steam app id)
 *   3. OS-extracted .exe / .app icon via Electron IPC (Electron only)
 *   4. Final fallback: colored letter tile (handled by <ActivityIcon> component)
 *
 * All keys are lowercased and matched against BOTH the activity `name` and
 * the underlying process name. Add new entries freely — order doesn't matter.
 */

/** Direct image URLs for popular games & software. Keyed by lowercased name OR process name. */
export const CURATED_ICONS: Record<string, string> = {
  // --- Riot ---
  "valorant": "https://cdn2.steamgriddb.com/icon/8c2f1d3acb91eed6d9f55ac41bcc41d7.png",
  "league of legends": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/League_of_Legends_2019_vector.svg/240px-League_of_Legends_2019_vector.svg.png",
  "leagueclient": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/League_of_Legends_2019_vector.svg/240px-League_of_Legends_2019_vector.svg.png",
  "teamfight tactics": "https://cdn2.steamgriddb.com/icon/0f1c7cd7791bf0a8b6efbd0a72e3a74e.png",
  "tft": "https://cdn2.steamgriddb.com/icon/0f1c7cd7791bf0a8b6efbd0a72e3a74e.png",

  // --- Valve / Steam ---
  "steam": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Steam_icon_logo.svg/240px-Steam_icon_logo.svg.png",
  "counter-strike 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "cs2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "counter-strike: global offensive": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "csgo": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg",
  "dota 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/capsule_184x69.jpg",
  "dota2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/570/capsule_184x69.jpg",
  "half-life 2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/220/capsule_184x69.jpg",
  "hl2": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/220/capsule_184x69.jpg",

  // --- Epic / Fortnite ---
  "fortnite": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Fortnite_F_lettermark_logo.png/240px-Fortnite_F_lettermark_logo.png",
  "fortniteclient-win64-shipping": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Fortnite_F_lettermark_logo.png/240px-Fortnite_F_lettermark_logo.png",
  "epic games launcher": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/240px-Epic_Games_logo.svg.png",
  "epicgameslauncher": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/Epic_Games_logo.svg/240px-Epic_Games_logo.svg.png",
  "rocket league": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",
  "rocketleague": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/252950/capsule_184x69.jpg",

  // --- Minecraft ---
  "minecraft": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Minecraft_logo.svg/240px-Minecraft_logo.svg.png",
  "minecraft launcher": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Minecraft_logo.svg/240px-Minecraft_logo.svg.png",
  "minecraftlauncher": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Minecraft_logo.svg/240px-Minecraft_logo.svg.png",
  "javaw": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Minecraft_logo.svg/240px-Minecraft_logo.svg.png",
  "minecraft (prism)": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Minecraft_logo.svg/240px-Minecraft_logo.svg.png",

  // --- Roblox ---
  "roblox": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Roblox_Logo.svg/240px-Roblox_Logo.svg.png",
  "robloxplayerbeta": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Roblox_Logo.svg/240px-Roblox_Logo.svg.png",

  // --- Battle.net / Blizzard ---
  "battle.net": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Battle.net_logo.svg/240px-Battle.net_logo.svg.png",
  "world of warcraft": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/World_of_Warcraft_logo.svg/240px-World_of_Warcraft_logo.svg.png",
  "wow": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/World_of_Warcraft_logo.svg/240px-World_of_Warcraft_logo.svg.png",
  "overwatch 2": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Overwatch_2_logo.svg/240px-Overwatch_2_logo.svg.png",
  "overwatch": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Overwatch_2_logo.svg/240px-Overwatch_2_logo.svg.png",
  "diablo iv": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Diablo_IV_Logo.svg/240px-Diablo_IV_Logo.svg.png",
  "hearthstone": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/Hearthstone_logo.png/240px-Hearthstone_logo.png",

  // --- EA / Apex / Call of Duty ---
  "apex legends": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Apex_legends_logo.png/240px-Apex_legends_logo.png",
  "r5apex": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Apex_legends_logo.png/240px-Apex_legends_logo.png",
  "apex_legends": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c1/Apex_legends_logo.png/240px-Apex_legends_logo.png",
  "ea app": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/EA_Sports_logo.svg/240px-EA_Sports_logo.svg.png",
  "ea sports fc 24": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/EA_Sports_logo.svg/240px-EA_Sports_logo.svg.png",
  "fifa24": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/EA_Sports_logo.svg/240px-EA_Sports_logo.svg.png",
  "call of duty": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Call_of_Duty_Logo_2019.svg/240px-Call_of_Duty_Logo_2019.svg.png",
  "call of duty: warzone": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Call_of_Duty_Logo_2019.svg/240px-Call_of_Duty_Logo_2019.svg.png",
  "call of duty: modern warfare": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Call_of_Duty_Logo_2019.svg/240px-Call_of_Duty_Logo_2019.svg.png",
  "warzone": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Call_of_Duty_Logo_2019.svg/240px-Call_of_Duty_Logo_2019.svg.png",
  "cod": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Call_of_Duty_Logo_2019.svg/240px-Call_of_Duty_Logo_2019.svg.png",

  // --- Ubisoft ---
  "rainbow six siege": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Rainbow_Six_Siege_logo.svg/240px-Rainbow_Six_Siege_logo.svg.png",
  "rainbow6": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Rainbow_Six_Siege_logo.svg/240px-Rainbow_Six_Siege_logo.svg.png",
  "rainbowsix": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Rainbow_Six_Siege_logo.svg/240px-Rainbow_Six_Siege_logo.svg.png",
  "ubisoft connect": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Ubisoft_logo.svg/240px-Ubisoft_logo.svg.png",
  "upc": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Ubisoft_logo.svg/240px-Ubisoft_logo.svg.png",

  // --- Indie / popular ---
  "among us": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Among_Us_logo.svg/240px-Among_Us_logo.svg.png",
  "amongus": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Among_Us_logo.svg/240px-Among_Us_logo.svg.png",
  "terraria": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/105600/capsule_184x69.jpg",
  "stardew valley": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/413150/capsule_184x69.jpg",
  "stardewvalley": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/413150/capsule_184x69.jpg",
  "hollow knight": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/capsule_184x69.jpg",
  "hollow_knight": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/367520/capsule_184x69.jpg",

  // --- Software ---
  "discord": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Discord-Logo-Color.svg/240px-Discord-Logo-Color.svg.png",
  "spotify": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/240px-Spotify_logo_without_text.svg.png",
  "visual studio code": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/240px-Visual_Studio_Code_1.35_icon.svg.png",
  "vscode": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/240px-Visual_Studio_Code_1.35_icon.svg.png",
  "code": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/240px-Visual_Studio_Code_1.35_icon.svg.png",
  "obs": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/OBS_Studio_logo.svg/240px-OBS_Studio_logo.svg.png",
  "obs64": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/OBS_Studio_logo.svg/240px-OBS_Studio_logo.svg.png",
  "chrome": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Google_Chrome_icon_%28September_2014%29.svg/240px-Google_Chrome_icon_%28September_2014%29.svg.png",
  "firefox": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Firefox_logo%2C_2019.svg/240px-Firefox_logo%2C_2019.svg.png",
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
