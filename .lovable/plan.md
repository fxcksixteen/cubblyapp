# v0.4.12 Plan

## 1. Screenshare lag (games and sometimes browsers)

Root causes still in play after v0.4.11:
- Capture source (Electron `getDisplayMedia`) frequently delivers native-res 4K/1440p @ 60fps regardless of our constraint hints — the encoder then spends its budget scaling instead of encoding, especially for full-screen games where the source is high-motion.
- No `contentHint = "motion"` on Ultra means the encoder treats game frames as mixed text/motion, hurting motion smoothness.
- Bitrate ceilings are still high enough (up to 12 Mbps @1440p60 non-Ultra) that on software VP9 encode or a marginal uplink they cause queue buildup → the exact "always laggy, always delayed" symptom.
- Encoder-side jitter buffer (`playoutDelayHint`) on the receiver isn't pinned low.
- No explicit hard cap on capture framerate at the track level (`applyConstraints` is a hint on desktop capture).

### Changes in `src/contexts/VoiceContext.tsx` and `src/contexts/GroupCallContext.tsx`

1. Force `contentHint = "motion"` for Ultra as well (dropping the neutral "" case). Games and video are motion-dominant; "detail" only makes sense for text/code sharing (Clarity preset already sets it).
2. Rebalance the bitrate ladder to a tighter, actually-shippable set that matches Discord's real-world caps and prevents queue buildup on typical home upload:
   - Non-Ultra 1080p60 → 4.5 Mbps (was 7.5 Mbps)
   - Non-Ultra 1440p60 → 8 Mbps (was 12 Mbps)
   - Ultra keeps its current numbers.
3. Add an always-on capture hard-clamp: if the source track's real height/fps (from `getSettings()`) exceeds the negotiated target, use `scaleResolutionDownBy` AND a stricter `maxFramerate` on the encoding, and re-call `applyConstraints` with `frameRate: { max: fpsCap }` (range form is more likely to be honored than a bare number).
4. Set `sender.getParameters().encodings[0].adaptivePtime = true` where available, and set `RTCRtpReceiver.playoutDelayHint = 0` on remote screenshare video tracks (both DM and group). Prevents Chromium's 200–400 ms default buffer that makes screenshare feel "delayed and choppy" even when frames are on time.
5. Add a rapid stats loop for screenshare (2s already) that also detects sustained `qualityLimitationReason === "cpu"` for >5s and drops the target by one tier automatically (1440p→1080p, 60→30) once, logging the reason. This is the CPU equivalent of the existing packet-loss reactor.
6. Tighten the low-power clamp: also apply when the encoder self-reports `qualityLimitationReason === "cpu"` on the very first stats sample after ramp-up, not only when `cubbly-low-power` flag is set. Catches users with hardware acceleration on but a weak CPU.

Both DM (`VoiceContext.tsx`) and group/server (`GroupCallContext.tsx`) get the exact same treatment — the group path already mirrors the DM path.

## 2. Roblox "always In Launcher"

`electron/gameDetails.cjs` scans the newest 5 `.log` files under `%LOCALAPPDATA%\Roblox\logs\`, but Roblox rotates *very* frequently and its actual game-join lines live in files whose names contain `Player` (e.g. `…_Player_….log`). The 5-newest-by-mtime slice frequently misses them because Roblox also writes launcher / crash-handler / http logs that are newer.

Additionally, the current regex set misses two of the most common modern Roblox join lines:
- `[FLog::Output] ! Joining game '<guid>' place <placeId>`
- `[DFLog::GameJoinLoadTime] Report game_join_loadtime ... placeid:<n>, universeid:<n>`
- `[FLog::SingleSurfaceApp] initiateTeleport … placeId:<n>`

### Changes in `electron/gameDetails.cjs` → `parseRoblox()`

1. Widen the file scan: read up to the 12 newest `.log` files, and additionally *always* include any file whose name matches `/player/i` regardless of position (the game-client log). Concat their tails.
2. Add these regexes to `placeIdMatch`:
   - `/Report game_join_loadtime[^]*?placeid[:=\s"']+(\d{5,})/gi`
   - `/place[Ii]d[:=\s"']+(\d{5,})/g` (broader — currently `/placeid.../i` misses `placeId`)
   - `/! Joining game[^\n]*?place\s+(\d{5,})/gi`
   - `/GameJoinUtil[^\n]*?placeId[:=\s]+(\d{5,})/gi`
3. Add `universeId` regex: `/game_join_loadtime[^]*?universeid[:=\s"']+(\d{5,})/gi` and `/universe[Ii]d[:=\s"']+(\d{5,})/g`.
4. Add a "recent activity" filter: only treat a join line as valid if its offset in the tail is within the last N bytes AND the log file's mtime is within the last 30 min. Prevents a stale place from a previous session sticking around forever.
5. Fall back to "In Game" (generic) if we detect *any* game-join marker but the REST lookup for the place name fails — currently we return `In Launcher` when enrichment fails, which is the bug the user is seeing.

## 3. Replace Fortnite activity logo

Save the uploaded `IMG_3929.png` (Fortnite "F" logo on blue gradient) as a Lovable asset, import it, and use it everywhere Fortnite's icon is referenced in `src/lib/activityIcons.ts`:
- key `"fortnite"`
- key `"fortniteclient-win64-shipping"`

Leaves `epicgames` / `epic games launcher` keys unchanged (still the Epic logo).

## 4. Version + changelog

- Bump `package.json` to `0.4.7` → `0.4.12`? — current is `0.4.11`. Bump to `0.4.12`.
- Bump `CURRENT_VERSION` in `src/lib/changelog.ts` to `0.4.12`.
- Add v0.4.12 entry with three short user-facing bullets:
  - Fixed screenshare lag/delay in games and browsers
  - Roblox activity now shows the actual experience you're in
  - New Fortnite activity icon

## Not doing (per user's standing rule)

- No web publish. Desktop patch only.
