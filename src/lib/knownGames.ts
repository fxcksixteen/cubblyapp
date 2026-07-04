/**
 * Built-in catalog of known game / software executables.
 *
 * Detection runs in 3 tiers:
 *   1. User's own custom games (`user_games` table) — always wins
 *   2. Exact process-name match against KNOWN_GAMES
 *   3. Substring / fuzzy match against KNOWN_PATTERNS — catches stuff like
 *      `ZenlessZoneZero.exe`, `GenshinImpact.exe`, `HSR_Launcher.exe`,
 *      regional variants, and Steam-shipped executables we haven't hardcoded
 *
 * Each entry is {name, type}:
 *   - type: "game"     → shows as "Playing X"
 *   - type: "software" → shows as "Using X"  (deprioritized — only surfaces
 *     if no real game is detected)
 */
export type ActivityKind = "game" | "software";

export interface KnownActivity {
  name: string;
  type: ActivityKind;
}

/** Exact process-name (lowercase, no .exe) → display info. */
export const KNOWN_GAMES: Record<string, KnownActivity> = {
  // ── HoYoverse ──
  "genshinimpact": { name: "Genshin Impact", type: "game" },
  "yuanshen": { name: "Genshin Impact", type: "game" },
  "starrail": { name: "Honkai: Star Rail", type: "game" },
  "hkrpg": { name: "Honkai: Star Rail", type: "game" },
  "honkaiimpact3": { name: "Honkai Impact 3rd", type: "game" },
  "bh3": { name: "Honkai Impact 3rd", type: "game" },
  "zenlesszonezero": { name: "Zenless Zone Zero", type: "game" },
  "zzz": { name: "Zenless Zone Zero", type: "game" },
  "nap": { name: "Zenless Zone Zero", type: "game" },
  "hoyoplay": { name: "HoYoPlay", type: "software" },

  // ── Riot ──
  "valorant": { name: "VALORANT", type: "game" },
  "valorant-win64-shipping": { name: "VALORANT", type: "game" },
  "leagueclient": { name: "League of Legends", type: "game" },
  "league of legends": { name: "League of Legends", type: "game" },
  "tft": { name: "Teamfight Tactics", type: "game" },
  "riotclientservices": { name: "Riot Client", type: "software" },
  "wildrift": { name: "Wild Rift", type: "game" },

  // ── Valve / Source ──
  "steam": { name: "Steam", type: "software" },
  "steamwebhelper": { name: "Steam", type: "software" },
  "cs2": { name: "Counter-Strike 2", type: "game" },
  "csgo": { name: "Counter-Strike: Global Offensive", type: "game" },
  "dota2": { name: "Dota 2", type: "game" },
  "hl2": { name: "Half-Life 2", type: "game" },
  "tf_win64": { name: "Team Fortress 2", type: "game" },
  "portal2": { name: "Portal 2", type: "game" },
  "deadlock": { name: "Deadlock", type: "game" },

  // ── Epic / Fortnite ──
  "fortniteclient-win64-shipping": { name: "Fortnite", type: "game" },
  "fortnite": { name: "Fortnite", type: "game" },
  "epicgameslauncher": { name: "Epic Games Launcher", type: "software" },
  "rocketleague": { name: "Rocket League", type: "game" },
  "fall guys": { name: "Fall Guys", type: "game" },
  "fallguys_client_game": { name: "Fall Guys", type: "game" },

  // ── Minecraft ──
  "minecraft": { name: "Minecraft", type: "game" },
  "minecraftlauncher": { name: "Minecraft Launcher", type: "software" },
  "javaw": { name: "Minecraft", type: "game" },
  "prismlauncher": { name: "Minecraft (Prism)", type: "software" },
  "modrinth-app": { name: "Modrinth App", type: "software" },
  "atlauncher": { name: "ATLauncher", type: "software" },
  "minecraftbedrock": { name: "Minecraft Bedrock", type: "game" },
  "minecraft.windows": { name: "Minecraft Bedrock", type: "game" },

  // ── Roblox ──
  "robloxplayerbeta": { name: "Roblox", type: "game" },
  "robloxplayer": { name: "Roblox", type: "game" },
  "robloxplayerlauncher": { name: "Roblox", type: "game" },
  "roblox": { name: "Roblox", type: "game" },
  "robloxstudiobeta": { name: "Roblox Studio", type: "software" },

  // ── NetEase / Marvel ──
  "marvel-win64-shipping": { name: "Marvel Rivals", type: "game" },
  "marvel rivals": { name: "Marvel Rivals", type: "game" },
  "marvelrivals": { name: "Marvel Rivals", type: "game" },

  // ── Battle.net / Blizzard ──
  "battle.net": { name: "Battle.net", type: "software" },
  "wow": { name: "World of Warcraft", type: "game" },
  "wow-64": { name: "World of Warcraft", type: "game" },
  "overwatch": { name: "Overwatch 2", type: "game" },
  "diablo iv": { name: "Diablo IV", type: "game" },
  "diabloiv": { name: "Diablo IV", type: "game" },
  "hearthstone": { name: "Hearthstone", type: "game" },
  "starcraft": { name: "StarCraft II", type: "game" },
  "starcraft ii": { name: "StarCraft II", type: "game" },

  // ── EA ──
  "apex_legends": { name: "Apex Legends", type: "game" },
  "r5apex": { name: "Apex Legends", type: "game" },
  "r5apex_dx12": { name: "Apex Legends", type: "game" },
  "fifa24": { name: "EA SPORTS FC 24", type: "game" },
  "fc24": { name: "EA SPORTS FC 24", type: "game" },
  "fc25": { name: "EA SPORTS FC 25", type: "game" },
  "ea": { name: "EA App", type: "software" },
  "eadesktop": { name: "EA App", type: "software" },
  "battlefield": { name: "Battlefield", type: "game" },
  "bf2042": { name: "Battlefield 2042", type: "game" },
  "thesims4": { name: "The Sims 4", type: "game" },

  // ── Activision / Call of Duty ──
  "modernwarfare": { name: "Call of Duty: Modern Warfare", type: "game" },
  "cod": { name: "Call of Duty", type: "game" },
  "warzone": { name: "Call of Duty: Warzone", type: "game" },
  "bo6": { name: "Call of Duty: Black Ops 6", type: "game" },
  "blackops6": { name: "Call of Duty: Black Ops 6", type: "game" },

  // ── Ubisoft ──
  "rainbow6": { name: "Rainbow Six Siege", type: "game" },
  "rainbowsix": { name: "Rainbow Six Siege", type: "game" },
  "rainbowsix_vulkan": { name: "Rainbow Six Siege", type: "game" },
  "upc": { name: "Ubisoft Connect", type: "software" },
  "ubisoftconnect": { name: "Ubisoft Connect", type: "software" },
  "thecrew": { name: "The Crew", type: "game" },

  // ── FromSoftware / Bandai Namco ──
  "eldenring": { name: "Elden Ring", type: "game" },
  "darksoulsiii": { name: "Dark Souls III", type: "game" },
  "sekiro": { name: "Sekiro: Shadows Die Twice", type: "game" },
  "armoredcore6": { name: "Armored Core VI", type: "game" },

  // ── Indie / popular ──
  "amongus": { name: "Among Us", type: "game" },
  "terraria": { name: "Terraria", type: "game" },
  "stardew valley": { name: "Stardew Valley", type: "game" },
  "stardewvalley": { name: "Stardew Valley", type: "game" },
  "hollow_knight": { name: "Hollow Knight", type: "game" },
  "celeste": { name: "Celeste", type: "game" },
  "hades2": { name: "Hades II", type: "game" },
  "hades": { name: "Hades", type: "game" },
  "rimworldwin64": { name: "RimWorld", type: "game" },
  "factorio": { name: "Factorio", type: "game" },
  "noita": { name: "Noita", type: "game" },
  "deeprockgalactic": { name: "Deep Rock Galactic", type: "game" },
  "fsd-win64-shipping": { name: "Deep Rock Galactic", type: "game" },
  "lethalcompany": { name: "Lethal Company", type: "game" },
  "contentwarning": { name: "Content Warning", type: "game" },
  "phasmophobia": { name: "Phasmophobia", type: "game" },
  "balatro": { name: "Balatro", type: "game" },
  "palworld": { name: "Palworld", type: "game" },
  "palworld-win64-shipping": { name: "Palworld", type: "game" },
  "valheim": { name: "Valheim", type: "game" },
  "rust": { name: "Rust", type: "game" },
  "ark": { name: "ARK: Survival Evolved", type: "game" },
  "arkascended": { name: "ARK: Survival Ascended", type: "game" },
  "satisfactory": { name: "Satisfactory", type: "game" },
  "factoryGame-win64-shipping": { name: "Satisfactory", type: "game" },
  "thefinals": { name: "THE FINALS", type: "game" },
  "discovery-win64-shipping": { name: "THE FINALS", type: "game" },
  "helldivers2": { name: "Helldivers 2", type: "game" },
  "wuthering waves": { name: "Wuthering Waves", type: "game" },
  "wutheringwaves": { name: "Wuthering Waves", type: "game" },
  "client-win64-shipping": { name: "Wuthering Waves", type: "game" },
  "tarkov": { name: "Escape from Tarkov", type: "game" },
  "escapefromtarkov": { name: "Escape from Tarkov", type: "game" },
  "deltaforce": { name: "Delta Force", type: "game" },
  "thelastofus": { name: "The Last of Us Part I", type: "game" },
  "horizonzerodawn": { name: "Horizon Zero Dawn", type: "game" },
  "godofwar": { name: "God of War", type: "game" },
  "rdr2": { name: "Red Dead Redemption 2", type: "game" },
  "gta5": { name: "Grand Theft Auto V", type: "game" },
  "gtav": { name: "Grand Theft Auto V", type: "game" },
  "cyberpunk2077": { name: "Cyberpunk 2077", type: "game" },
  "witcher3": { name: "The Witcher 3: Wild Hunt", type: "game" },
  "baldurs gate 3": { name: "Baldur's Gate 3", type: "game" },
  "bg3": { name: "Baldur's Gate 3", type: "game" },
  "bg3_dx11": { name: "Baldur's Gate 3", type: "game" },
  "spider-man": { name: "Marvel's Spider-Man", type: "game" },

  // ── Software platforms (deprioritized) ──
  "discord": { name: "Discord", type: "software" },
  "spotify": { name: "Spotify", type: "software" },
  "obs64": { name: "OBS Studio", type: "software" },
  "obs": { name: "OBS Studio", type: "software" },
  "code": { name: "VS Code", type: "software" },
  "windowsterminal": { name: "Windows Terminal", type: "software" },
};

/**
 * Substring patterns for executables that don't match exactly. Used as a
 * fallback so things like `ZenlessZoneZero_v1.exe`, `GenshinImpact_Data` or
 * Steam shipping suffixes still resolve. Order matters — first hit wins.
 */
interface KnownPattern {
  match: RegExp;
  name: string;
  type: ActivityKind;
}

export const KNOWN_PATTERNS: KnownPattern[] = [
  { match: /zenlesszone|^zzz[\W_]/i, name: "Zenless Zone Zero", type: "game" },
  { match: /genshinimpact|yuanshen/i, name: "Genshin Impact", type: "game" },
  { match: /(starrail|hkrpg)/i, name: "Honkai: Star Rail", type: "game" },
  { match: /honkaiimpact|^bh3$/i, name: "Honkai Impact 3rd", type: "game" },
  { match: /wuthering|wuwa/i, name: "Wuthering Waves", type: "game" },
  { match: /valorant/i, name: "VALORANT", type: "game" },
  { match: /leagueclient|league of legends/i, name: "League of Legends", type: "game" },
  { match: /fortniteclient/i, name: "Fortnite", type: "game" },
  { match: /apex|r5apex/i, name: "Apex Legends", type: "game" },
  { match: /palworld/i, name: "Palworld", type: "game" },
  { match: /helldivers/i, name: "Helldivers 2", type: "game" },
  { match: /eldenring/i, name: "Elden Ring", type: "game" },
  { match: /baldur/i, name: "Baldur's Gate 3", type: "game" },
  { match: /cyberpunk/i, name: "Cyberpunk 2077", type: "game" },
  { match: /witcher3/i, name: "The Witcher 3: Wild Hunt", type: "game" },
  { match: /minecraft/i, name: "Minecraft", type: "game" },
  { match: /roblox(player|playerbeta|playerlauncher)?$/i, name: "Roblox", type: "game" },
  { match: /marvelrivals|marvel-win64/i, name: "Marvel Rivals", type: "game" },
  { match: /the[\W_]?finals|discovery-win64/i, name: "THE FINALS", type: "game" },
  { match: /^(cs2|csgo)$/i, name: "Counter-Strike 2", type: "game" },
  { match: /dota2/i, name: "Dota 2", type: "game" },
  { match: /overwatch/i, name: "Overwatch 2", type: "game" },
  { match: /^wow(_|-|$)/i, name: "World of Warcraft", type: "game" },
  { match: /diablo/i, name: "Diablo IV", type: "game" },
  { match: /hearthstone/i, name: "Hearthstone", type: "game" },
  { match: /starcraft/i, name: "StarCraft II", type: "game" },
  { match: /modernwarfare|warzone|bo6|blackops/i, name: "Call of Duty", type: "game" },
  { match: /rainbow(six|6)/i, name: "Rainbow Six Siege", type: "game" },
  { match: /rocketleague/i, name: "Rocket League", type: "game" },
  { match: /fallguys/i, name: "Fall Guys", type: "game" },
  { match: /tarkov/i, name: "Escape from Tarkov", type: "game" },
  { match: /satisfactory|factorygame/i, name: "Satisfactory", type: "game" },
  { match: /^valheim/i, name: "Valheim", type: "game" },
  { match: /^rust/i, name: "Rust", type: "game" },
  { match: /^ark(survival)?/i, name: "ARK: Survival", type: "game" },
  { match: /stardew/i, name: "Stardew Valley", type: "game" },
  { match: /balatro/i, name: "Balatro", type: "game" },
  { match: /lethalcompany/i, name: "Lethal Company", type: "game" },
  { match: /phasmophobia/i, name: "Phasmophobia", type: "game" },
  { match: /rdr2|reddead/i, name: "Red Dead Redemption 2", type: "game" },
  { match: /^gta(5|v)/i, name: "Grand Theft Auto V", type: "game" },
  { match: /sims?4/i, name: "The Sims 4", type: "game" },
  { match: /^fifa|^fc2[45]/i, name: "EA SPORTS FC", type: "game" },
  // software fallbacks
  { match: /^steam/i, name: "Steam", type: "software" },
  { match: /epicgames/i, name: "Epic Games Launcher", type: "software" },
  { match: /battle\.net/i, name: "Battle.net", type: "software" },
  { match: /eadesktop|^ea$/i, name: "EA App", type: "software" },
  { match: /ubisoft/i, name: "Ubisoft Connect", type: "software" },
  { match: /hoyoplay/i, name: "HoYoPlay", type: "software" },
  { match: /^discord/i, name: "Discord", type: "software" },
];

export interface DetectedActivity {
  processName: string;
  displayName: string;
  type: ActivityKind;
}

function lookupKnown(proc: string): KnownActivity | null {
  if (KNOWN_GAMES[proc]) return KNOWN_GAMES[proc];
  for (const pat of KNOWN_PATTERNS) {
    if (pat.match.test(proc)) return { name: pat.name, type: pat.type };
  }
  return null;
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
  const procSet = new Set(runningProcesses.map((p) => p.toLowerCase().replace(/\.exe$/, "")));

  // 1. User's manual entries are always treated as real games (highest priority)
  for (const g of userGames) {
    const key = g.process_name.toLowerCase().replace(/\.exe$/, "");
    if (procSet.has(key)) {
      return { processName: key, displayName: g.display_name, type: "game" };
    }
    // Also support substring user entries (e.g. user entered "zenless")
    for (const proc of procSet) {
      if (key && (proc.includes(key) || key.includes(proc))) {
        return { processName: proc, displayName: g.display_name, type: "game" };
      }
    }
  }

  // 2. Built-in games (real games beat software)
  let softwareMatch: DetectedActivity | null = null;
  for (const proc of procSet) {
    const known = lookupKnown(proc);
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

/** Pretty-format a process name for the Add-a-Game suggestion field. */
export function suggestDisplayName(processName: string): string {
  const known = lookupKnown(processName.toLowerCase().replace(/\.exe$/, ""));
  if (known) return known.name;
  return processName
    .replace(/\.exe$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
