/**
 * Built-in whitelist of popular game executables. The activity scanner matches
 * running process names (lowercase, no .exe) against this list AND the user's
 * personal `user_games` table to figure out what they're playing.
 *
 * Add to this list freely — entries are fast lookups in a Map.
 */
export const KNOWN_GAMES: Record<string, string> = {
  // Riot
  "valorant": "VALORANT",
  "valorant-win64-shipping": "VALORANT",
  "leagueclient": "League of Legends",
  "league of legends": "League of Legends",
  "tft": "Teamfight Tactics",

  // Steam / Valve
  "steam": "Steam",
  "cs2": "Counter-Strike 2",
  "csgo": "Counter-Strike: Global Offensive",
  "dota2": "Dota 2",
  "hl2": "Half-Life 2",

  // Epic / Fortnite
  "fortniteclient-win64-shipping": "Fortnite",
  "fortnite": "Fortnite",
  "epicgameslauncher": "Epic Games Launcher",
  "rocketleague": "Rocket League",

  // Minecraft
  "minecraft": "Minecraft",
  "minecraftlauncher": "Minecraft Launcher",
  "javaw": "Minecraft", // common, but generic — kept low priority
  "prismlauncher": "Minecraft (Prism)",

  // Roblox
  "robloxplayerbeta": "Roblox",
  "roblox": "Roblox",

  // Battle.net / Blizzard
  "battle.net": "Battle.net",
  "wow": "World of Warcraft",
  "overwatch": "Overwatch 2",
  "diablo iv": "Diablo IV",
  "hearthstone": "Hearthstone",

  // EA
  "apex_legends": "Apex Legends",
  "r5apex": "Apex Legends",
  "fifa24": "EA SPORTS FC 24",
  "ea": "EA App",

  // Activision / Call of Duty
  "modernwarfare": "Call of Duty: Modern Warfare",
  "cod": "Call of Duty",
  "warzone": "Call of Duty: Warzone",

  // Ubisoft
  "rainbow6": "Rainbow Six Siege",
  "rainbowsix": "Rainbow Six Siege",
  "upc": "Ubisoft Connect",

  // Indie / popular
  "amongus": "Among Us",
  "terraria": "Terraria",
  "stardew valley": "Stardew Valley",
  "stardewvalley": "Stardew Valley",
  "hollow_knight": "Hollow Knight",

  // Other launchers
  "discord": "Discord",
};

/**
 * Pick the most relevant running game out of a list of process names.
 * Combines the built-in whitelist with the user's manual `user_games` entries.
 */
export function detectGame(
  runningProcesses: string[],
  userGames: Array<{ process_name: string; display_name: string }>
): { processName: string; displayName: string } | null {
  const procSet = new Set(runningProcesses.map((p) => p.toLowerCase()));

  // User's manual entries take priority
  for (const g of userGames) {
    const key = g.process_name.toLowerCase().replace(/\.exe$/, "");
    if (procSet.has(key)) {
      return { processName: key, displayName: g.display_name };
    }
  }

  // Then fall back to the built-in whitelist
  for (const proc of procSet) {
    if (KNOWN_GAMES[proc]) {
      return { processName: proc, displayName: KNOWN_GAMES[proc] };
    }
  }

  return null;
}
