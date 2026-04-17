/**
 * Built-in whitelist of popular game executables. The activity scanner matches
 * running process names (lowercase, no .exe) against this list AND the user's
 * personal `user_games` table to figure out what they're playing.
 *
 * Each entry is now {name, type}:
 *   - type: "game"     → shows as "Playing X"
 *   - type: "software" → shows as "Using X"  (and is DEPRIORITIZED — only
 *     surfaces if no real game is detected)
 */
export type ActivityKind = "game" | "software";

export interface KnownActivity {
  name: string;
  type: ActivityKind;
}

export const KNOWN_GAMES: Record<string, KnownActivity> = {
  // Riot
  "valorant": { name: "VALORANT", type: "game" },
  "valorant-win64-shipping": { name: "VALORANT", type: "game" },
  "leagueclient": { name: "League of Legends", type: "game" },
  "league of legends": { name: "League of Legends", type: "game" },
  "tft": { name: "Teamfight Tactics", type: "game" },

  // Steam / Valve — Steam itself is software, the games are games
  "steam": { name: "Steam", type: "software" },
  "cs2": { name: "Counter-Strike 2", type: "game" },
  "csgo": { name: "Counter-Strike: Global Offensive", type: "game" },
  "dota2": { name: "Dota 2", type: "game" },
  "hl2": { name: "Half-Life 2", type: "game" },

  // Epic / Fortnite
  "fortniteclient-win64-shipping": { name: "Fortnite", type: "game" },
  "fortnite": { name: "Fortnite", type: "game" },
  "epicgameslauncher": { name: "Epic Games Launcher", type: "software" },
  "rocketleague": { name: "Rocket League", type: "game" },

  // Minecraft
  "minecraft": { name: "Minecraft", type: "game" },
  "minecraftlauncher": { name: "Minecraft Launcher", type: "software" },
  "javaw": { name: "Minecraft", type: "game" }, // common but generic
  "prismlauncher": { name: "Minecraft (Prism)", type: "software" },

  // Roblox
  "robloxplayerbeta": { name: "Roblox", type: "game" },
  "roblox": { name: "Roblox", type: "game" },

  // Battle.net / Blizzard
  "battle.net": { name: "Battle.net", type: "software" },
  "wow": { name: "World of Warcraft", type: "game" },
  "overwatch": { name: "Overwatch 2", type: "game" },
  "diablo iv": { name: "Diablo IV", type: "game" },
  "hearthstone": { name: "Hearthstone", type: "game" },

  // EA
  "apex_legends": { name: "Apex Legends", type: "game" },
  "r5apex": { name: "Apex Legends", type: "game" },
  "fifa24": { name: "EA SPORTS FC 24", type: "game" },
  "ea": { name: "EA App", type: "software" },

  // Activision / Call of Duty
  "modernwarfare": { name: "Call of Duty: Modern Warfare", type: "game" },
  "cod": { name: "Call of Duty", type: "game" },
  "warzone": { name: "Call of Duty: Warzone", type: "game" },

  // Ubisoft
  "rainbow6": { name: "Rainbow Six Siege", type: "game" },
  "rainbowsix": { name: "Rainbow Six Siege", type: "game" },
  "upc": { name: "Ubisoft Connect", type: "software" },

  // Indie / popular
  "amongus": { name: "Among Us", type: "game" },
  "terraria": { name: "Terraria", type: "game" },
  "stardew valley": { name: "Stardew Valley", type: "game" },
  "stardewvalley": { name: "Stardew Valley", type: "game" },
  "hollow_knight": { name: "Hollow Knight", type: "game" },

  // Software platforms (deprioritized)
  "discord": { name: "Discord", type: "software" },
};

export interface DetectedActivity {
  processName: string;
  displayName: string;
  type: ActivityKind;
}

/**
 * Pick the most relevant running activity. Real games always win over software
 * launchers like Steam/Discord, so a user playing Counter-Strike with Steam
 * also running shows "Playing Counter-Strike 2" — never "Using Steam".
 */
export function detectGame(
  runningProcesses: string[],
  userGames: Array<{ process_name: string; display_name: string }>,
): DetectedActivity | null {
  const procSet = new Set(runningProcesses.map((p) => p.toLowerCase()));

  // 1. User's manual entries are always treated as real games (highest priority)
  for (const g of userGames) {
    const key = g.process_name.toLowerCase().replace(/\.exe$/, "");
    if (procSet.has(key)) {
      return { processName: key, displayName: g.display_name, type: "game" };
    }
  }

  // 2. Built-in games (real games beat software)
  let softwareMatch: DetectedActivity | null = null;
  for (const proc of procSet) {
    const known = KNOWN_GAMES[proc];
    if (!known) continue;
    if (known.type === "game") {
      return { processName: proc, displayName: known.name, type: "game" };
    }
    if (!softwareMatch) {
      softwareMatch = { processName: proc, displayName: known.name, type: "software" };
    }
  }

  return softwareMatch;
}

/** Verb to show in UI: "Playing X" for games, "Using X" for software. */
export function activityVerb(type: ActivityKind | undefined | null): "Playing" | "Using" {
  return type === "software" ? "Using" : "Playing";
}
