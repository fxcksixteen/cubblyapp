/**
 * Rich game presence parsers (Phase 6 / v0.4.0).
 *
 * Best-effort log/file/REST scrapers for a handful of popular games. Every
 * single read is wrapped in try/catch and falls back to `null` on error —
 * if a parser fails, callers simply get no rich details and the activity
 * stays as a plain "Playing X" card. NEVER throw out of here, and NEVER
 * spawn long-running children — this gets called once per activity tick.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const https = require("https");

// ---------- helpers ----------------------------------------------------------

/** Read the last N bytes of a file; safe on huge log files. */
function tailFile(filePath, bytes = 64 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    const start = Math.max(0, stat.size - bytes);
    const fd = fs.openSync(filePath, "r");
    try {
      const buf = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function newestFileIn(dir, predicate = () => true) {
  try {
    const entries = fs.readdirSync(dir);
    let best = null;
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (!st.isFile()) continue;
        if (!predicate(name)) continue;
        if (!best || st.mtimeMs > best.mtime) best = { full, mtime: st.mtimeMs };
      } catch { /* skip */ }
    }
    return best?.full ?? null;
  } catch {
    return null;
  }
}

/**
 * Simple HTTPS GET → JSON, resolves null on any failure. Used by Roblox
 * place-name lookup and other public REST enrichment. Never throws.
 */
function httpsGetJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          host: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: "GET",
          headers: { Accept: "application/json", "User-Agent": "Cubbly/1.0" },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
            catch { resolve(null); }
          });
        }
      );
      req.on("error", () => resolve(null));
      req.on("timeout", () => { try { req.destroy(); } catch {} resolve(null); });
      req.end();
    } catch { resolve(null); }
  });
}

// Cache Roblox place-name lookups so we don't hammer the API each tick.
// Cleared on process exit — that's fine, a fresh Cubbly session re-populates.
const _robloxNameCache = new Map(); // placeId → { name, universeId, ts }

async function fetchRobloxPlaceName(placeId) {
  if (!placeId) return null;
  const cached = _robloxNameCache.get(String(placeId));
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) return cached; // 6h TTL
  try {
    // Step 1: placeId → universeId (Roblox splits places from universes).
    const uni = await httpsGetJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
    const universeId = uni?.universeId ?? null;
    if (!universeId) { _robloxNameCache.set(String(placeId), { name: null, universeId: null, ts: Date.now() }); return null; }
    // Step 2: universeId → name.
    const games = await httpsGetJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`);
    const name = games?.data?.[0]?.name ?? null;
    const entry = { name, universeId, ts: Date.now() };
    _robloxNameCache.set(String(placeId), entry);
    return entry;
  } catch {
    return null;
  }
}

// ---------- LEAGUE OF LEGENDS (LCU REST) -------------------------------------
// The Riot client exposes a localhost HTTPS API with a self-signed cert. We
// discover the port + token from lockfile, then ask for the current champion
// + KDA + game time. No third-party API key required.
function readLockfile() {
  if (process.platform !== "win32" && process.platform !== "darwin") return null;
  const candidates = process.platform === "win32"
    ? [
        "C:\\Riot Games\\League of Legends\\lockfile",
        path.join(process.env.LOCALAPPDATA || "", "Riot Games", "League of Legends", "lockfile"),
      ]
    : ["/Applications/League of Legends.app/Contents/LoL/lockfile"];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8").trim();
        // format: name:pid:port:password:protocol
        const parts = raw.split(":");
        if (parts.length >= 5) return { port: parts[2], password: parts[3] };
      }
    } catch { /* skip */ }
  }
  return null;
}

function lcuFetch(port, password, route) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        method: "GET",
        rejectUnauthorized: false,
        headers: {
          Authorization: "Basic " + Buffer.from("riot:" + password).toString("base64"),
          Accept: "application/json",
        },
        timeout: 1500,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch { resolve(null); }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// In-game data lives on a separate fixed port 2999 (no auth, self-signed).
function liveClientFetch(route) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: 2999,
        path: route,
        method: "GET",
        rejectUnauthorized: false,
        timeout: 1500,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch { resolve(null); }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function parseLeagueOfLegends() {
  // Try in-game live data first (richest payload).
  const live = await liveClientFetch("/liveclientdata/allgamedata");
  if (live?.activePlayer && live?.gameData) {
    const me = (live.allPlayers || []).find(
      (p) => p.summonerName === live.activePlayer.summonerName,
    );
    return {
      mode: live.gameData.gameMode || "Game",
      map: live.gameData.mapName || null,
      champion: me?.championName || null,
      level: me?.level || null,
      kda: me ? `${me.scores?.kills ?? 0}/${me.scores?.deaths ?? 0}/${me.scores?.assists ?? 0}` : null,
      gameTime: Math.floor(live.gameData.gameTime || 0),
    };
  }
  // Fall back to LCU lobby/queue info.
  const lock = readLockfile();
  if (!lock) return null;
  const session = await lcuFetch(lock.port, lock.password, "/lol-gameflow/v1/session");
  if (session?.phase) {
    return {
      mode: session.gameData?.queue?.description || session.phase,
      map: session.map?.name || null,
      champion: null,
      kda: null,
      gameTime: null,
      phase: session.phase,
    };
  }
  return null;
}

// ---------- VALORANT (ShooterGame.log) ---------------------------------------
function parseValorant() {
  if (process.platform !== "win32") return null;
  const logPath = path.join(
    process.env.LOCALAPPDATA || "",
    "VALORANT", "Saved", "Logs", "ShooterGame.log",
  );
  const tail = tailFile(logPath, 128 * 1024);
  if (!tail) { console.log("[game-details] valorant: no log at", logPath); return { status: "In match" }; }
  // Try to grab the most recent map + queue + score lines. Riot changes these
  // formats between patches, so try multiple variants.
  const mapMatch =
    [...tail.matchAll(/LogMapLoad: Loading map ([A-Za-z]+)/g)].pop() ||
    [...tail.matchAll(/Loading map [^\r\n]*Maps\/([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/MapName[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  const queueMatch =
    [...tail.matchAll(/QueueId[:=\s"']+([a-z]+)/gi)].pop() ||
    [...tail.matchAll(/GameMode[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  const agentMatch =
    [...tail.matchAll(/LogShooterAgent: .*?Agent (\w+)/gi)].pop() ||
    [...tail.matchAll(/CharacterID[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  const scoreMatch = [...tail.matchAll(/RoundResultsScore[^0-9-]*([0-9]+)[^0-9]+([0-9]+)/g)].pop();
  if (!mapMatch && !queueMatch && !agentMatch && !scoreMatch) {
    console.log("[game-details] valorant: log found but no matches — publishing minimal payload");
    return { status: "In match" };
  }
  return {
    map: mapMatch?.[1] ?? null,
    mode: queueMatch?.[1] ?? null,
    agent: agentMatch?.[1] ?? null,
    score: scoreMatch ? `${scoreMatch[1]}-${scoreMatch[2]}` : null,
  };
}


// ---------- MARVEL RIVALS ----------------------------------------------------
function parseMarvelRivals() {
  if (process.platform !== "win32") return null;
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "MarvelGame", "Saved", "Logs"),
    path.join(process.env.LOCALAPPDATA || "", "Marvel", "Saved", "Logs"),
  ];
  let logPath = null;
  for (const base of candidates) {
    if (!fs.existsSync(base)) continue;
    const preferred = ["MarvelGame.log", "Marvel.log"]
      .map((n) => path.join(base, n))
      .find((p) => fs.existsSync(p));
    logPath = preferred || newestFileIn(base, (n) => n.endsWith(".log"));
    if (logPath) break;
  }
  if (!logPath) { console.log("[game-details] marvel-rivals: no log directory found"); return { status: "In match" }; }
  const tail = tailFile(logPath, 96 * 1024);
  if (!tail) return { status: "In match" };

  const mapMatch =
    [...tail.matchAll(/LoadLevel.*?Maps\/[^\/]+\/([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/CurrentMap[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  const heroMatch =
    [...tail.matchAll(/SelectedHero[:=]\s*([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/HeroName[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  const modeMatch =
    [...tail.matchAll(/GameMode[:=]\s*([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/MatchType[:=\s"']+([A-Za-z_0-9]+)/g)].pop();
  if (!mapMatch && !heroMatch && !modeMatch) {
    console.log("[game-details] marvel-rivals: log found but no matches — publishing minimal payload");
    return { status: "In match" };
  }

  return {
    map: mapMatch?.[1]?.replace(/_/g, " ") ?? null,
    hero: heroMatch?.[1] ?? null,
    mode: modeMatch?.[1] ?? null,
  };
}

// ---------- FORTNITE ---------------------------------------------------------
function parseFortnite() {
  if (process.platform !== "win32") return null;
  const logPath = path.join(
    process.env.LOCALAPPDATA || "",
    "FortniteGame", "Saved", "Logs", "FortniteGame.log",
  );
  const tail = tailFile(logPath, 96 * 1024);
  if (!tail) { console.log("[game-details] fortnite: no log at", logPath); return { status: "In match" }; }
  const playlistMatch =
    [...tail.matchAll(/Playlist[:=]\s*([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/PlaylistName[:=\s"']+([A-Za-z_0-9]+)/g)].pop() ||
    [...tail.matchAll(/MatchState[:=]\s*([A-Za-z_0-9]+)/g)].pop();
  const placementMatch =
    [...tail.matchAll(/Placement[:=]\s*(\d+)/g)].pop() ||
    [...tail.matchAll(/TeamPlacement[:=\s"']+(\d+)/g)].pop();
  const killsMatch =
    [...tail.matchAll(/PlayerKills[:=]\s*(\d+)/g)].pop() ||
    [...tail.matchAll(/TeamKills[:=\s"']+(\d+)/g)].pop();
  if (!playlistMatch && !placementMatch && !killsMatch) {
    console.log("[game-details] fortnite: log found but no matches — publishing minimal payload");
    return { status: "In match" };
  }

  return {
    mode: playlistMatch?.[1]?.replace(/^Playlist_/i, "") ?? null,
    placement: placementMatch?.[1] ? Number(placementMatch[1]) : null,
    kills: killsMatch?.[1] ? Number(killsMatch[1]) : null,
  };
}

// ---------- ROBLOX ----------------------------------------------------------
// Roblox writes per-session logs at %LOCALAPPDATA%\Roblox\logs\*.log. Newest
// file wins. Common lines include the target place name / placeId / universe
// as it joins servers. Everything is best-effort — bail to null on failure.
async function parseRoblox() {
  const platformDirs = process.platform === "win32"
    ? [path.join(process.env.LOCALAPPDATA || "", "Roblox", "logs")]
    : process.platform === "darwin"
      ? [path.join(os.homedir(), "Library", "Logs", "Roblox")]
      : [];
  let logPath = null;
  for (const dir of platformDirs) {
    // Roblox writes many small logs per session; scan the 5 newest instead of
    // just the newest one — the very newest can be a launcher/logger log with
    // no game-join lines yet, while the join lines land in a sibling log.
    logPath = newestFileIn(dir, (n) => n.endsWith(".log"));
    if (logPath) break;
  }
  if (!logPath) { console.log("[game-details] roblox: no log directory found"); return null; }

  // Read the 5 newest logs (concatenated tails) so we catch join lines even
  // when they're not in the single freshest file.
  const dir = path.dirname(logPath);
  let combined = "";
  try {
    const files = fs.readdirSync(dir)
      .filter((n) => n.endsWith(".log"))
      .map((n) => ({ n, m: (fs.statSync(path.join(dir, n)).mtimeMs || 0) }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 5);
    for (const { n } of files) combined += "\n" + (tailFile(path.join(dir, n), 96 * 1024) || "");
  } catch {
    combined = tailFile(logPath, 128 * 1024) || "";
  }
  const tail = combined;
  if (!tail) return null;

  // Expanded regexes covering real Roblox client log formats seen in the wild.
  const placeNameMatch =
    [...tail.matchAll(/placeName[\s"':=]+"?([^"\r\n,}]+)"?/gi)].pop() ||
    [...tail.matchAll(/GameName[\s"':=]+"?([^"\r\n,}]+)"?/gi)].pop() ||
    [...tail.matchAll(/Connecting to game '([^']+)'/gi)].pop() ||
    [...tail.matchAll(/joinGamePost\w*.*?place[= ]"?([A-Za-z0-9 _:'\-]+)"?/gi)].pop();
  const placeIdMatch =
    [...tail.matchAll(/placeid[:=\s"']+(\d{5,})/gi)].pop() ||
    [...tail.matchAll(/place\s*(\d{5,})/gi)].pop() ||
    [...tail.matchAll(/Joining game [^\n]*?(\d{9,})/gi)].pop() ||
    [...tail.matchAll(/game_join_loadtime[^0-9]+placeid[:=\s"']+(\d{5,})/gi)].pop() ||
    [...tail.matchAll(/joinGamePostPrivateServer[^\d]*(\d{5,})/gi)].pop() ||
    [...tail.matchAll(/initiateTeleportToPlaceInstance[^\d]*placeId[=:\s]+(\d{5,})/gi)].pop();
  const universeMatch =
    [...tail.matchAll(/universeid[:=\s"']+(\d{5,})/gi)].pop() ||
    [...tail.matchAll(/game_join_loadtime[^0-9]+universeid[:=\s"']+(\d{5,})/gi)].pop();
  const serverTypeMatch = [...tail.matchAll(/serverType[\s"':=]+"?([A-Za-z_]+)/gi)].pop();
  const studio = /RobloxStudio/i.test(logPath);

  const placeId = placeIdMatch?.[1] ? Number(placeIdMatch[1]) : null;
  const universeId = universeMatch?.[1] ? Number(universeMatch[1]) : null;
  let experience = placeNameMatch?.[1]?.trim() || null;

  // Enrichment: if we only have a placeId, look up the experience name via
  // Roblox's public REST API. This is the difference between friends seeing
  // "Playing Roblox" and "Adopt Me!". Cached for 6h per placeId.
  if (!experience && placeId) {
    const lookup = await fetchRobloxPlaceName(placeId);
    if (lookup?.name) experience = lookup.name;
  }

  if (!experience && !placeId && !universeId && !studio) {
    console.log("[game-details] roblox: log found but no matches — publishing minimal payload");
    // Publish SOMETHING so viewers see more than "Playing Roblox" + time.
    // This confirms the pipeline is alive and updates once real details land.
    return { status: "In an experience", studio: null };
  }
  return {
    experience: experience || null,
    placeId,
    universeId,
    serverType: serverTypeMatch?.[1] || null,
    studio: studio || null,
  };
}


// ---------- Dispatcher -------------------------------------------------------
const PARSERS = {
  "league of legends": { key: "lol", run: parseLeagueOfLegends },
  "leagueclient": { key: "lol", run: parseLeagueOfLegends },
  "league of legends.exe": { key: "lol", run: parseLeagueOfLegends },
  "valorant": { key: "valorant", run: async () => parseValorant() },
  "valorant-win64-shipping": { key: "valorant", run: async () => parseValorant() },
  "marvel rivals": { key: "marvel-rivals", run: async () => parseMarvelRivals() },
  "marvelrivals": { key: "marvel-rivals", run: async () => parseMarvelRivals() },
  "marvel-win64-shipping": { key: "marvel-rivals", run: async () => parseMarvelRivals() },
  "marvelgame-win64-shipping": { key: "marvel-rivals", run: async () => parseMarvelRivals() },
  "fortnite": { key: "fortnite", run: async () => parseFortnite() },
  "fortniteclient-win64-shipping": { key: "fortnite", run: async () => parseFortnite() },
  "roblox": { key: "roblox", run: async () => parseRoblox() },
  "robloxplayer": { key: "roblox", run: async () => parseRoblox() },
  "robloxplayerbeta": { key: "roblox", run: async () => parseRoblox() },
  "robloxstudiobeta": { key: "roblox", run: async () => parseRoblox() },
};

async function getGameDetails(identifier) {
  if (!identifier) return null;
  const key = String(identifier).toLowerCase().trim();
  const entry = PARSERS[key];
  if (!entry) { console.log(`[game-details] no parser for "${key}"`); return null; }
  try {
    const payload = await entry.run();
    if (!payload) { console.log(`[game-details] ${entry.key}: parser returned null for "${key}"`); return null; }
    console.log(`[game-details] ${entry.key}: OK`, payload);
    return { gameKey: entry.key, payload };
  } catch (e) {
    console.log(`[game-details] ${entry.key}: threw`, e?.message || e);
    return null;
  }
}

module.exports = { getGameDetails };
