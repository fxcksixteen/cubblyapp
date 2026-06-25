## v0.3.17 — Tagging, DND respect, DM mute, slim Electron, full emoji set

### 1. Real @mentions that bypass DND

Today `MentionAutocomplete` only autofills the display name as plain text — nothing in the message identifies the tagged user, and `useUnreadCounts` notifies with `force: true` for every new message, so DND is bypassed for everyone, mentioned or not.

**Send side (`ChatView.tsx` + `MentionAutocomplete.tsx`)**
- When the user picks a candidate, insert a Discord-style token `<@USER_ID>` into the textarea state instead of the bare `@Name`. Display it visually as a styled `@Name` chip using a controlled overlay (keep textarea logic simple: store the raw token; rendering for sent messages happens below).
- Right before insert into `messages.content`, the textarea already contains tokens — send as-is.

**Render side (message renderer used by `ChatView`)**
- In the existing text renderer, parse `<@uuid>` tokens and render them as blue mention chips (`@DisplayName`, resolved from participants / profile cache). Highlight chips that target the current user with a yellow-tinted background like Discord.

**Notification side (`useUnreadCounts.ts`)**
- Detect `<@${user.id}>` in the incoming `msg.content`. Set `isMention = true`.
- Stop unconditional `force: true`. New rules:
  - DM (1-on-1): notify + sound, gated by DND unless mentioned.
  - Group: notify + sound only if mentioned, or if DND is off (mirrors Discord "Only @mentions" behavior we already imply for groups).
  - If conversation is muted (see §3) → suppress everything regardless.
- Pass `force: isMention && !muted` to `notify()` and to `playSound("message", { force })`.

### 2. DND really suppresses everything else

Audit the other call sites that bypass DND:
- `playSound("message", { force: true })` → only force when mention.
- Ringing sounds (`VoiceContext`, `GroupCallContext`): already respect DND? Quick check; if they use `force`, gate behind `!dndActive`. Incoming-call desktop notifications should also be suppressed under DND (Discord behavior).

### 3. Mute system for DMs and groups

Schema already has `dm_preferences.muted` + `muted_until` per (user_id, conversation_id). Add full UX.

- **Helper**: `src/hooks/useDmMutes.ts` — loads the current user's `dm_preferences` rows once, exposes `isMuted(conversationId)` (true if `muted` OR `muted_until > now()`), and `setMute(conversationId, durationMs | "forever" | null)` which upserts the row.
- **Sidebar context menu (`DMSidebar.tsx`)**: add a "Mute Conversation" submenu before "Mark As Read", with options: 15 min / 1 hour / 3 hours / 8 hours / 24 hours / Until I turn it back on. If already muted, show "Unmute Conversation" instead and a small "muted until X" hint.
- **Visual cue**: render a small muted-bell icon next to the conversation name when muted; dim unread badge styling.
- **Hook into notifications**: `useUnreadCounts` consults `isMuted(conv.id)` and suppresses notify + sound + browser tab title flash. Muted conversations still increment unread count but stay silent (Discord behavior). Mentions in a muted conv are also silent.
- RLS on `dm_preferences` already restricts to the row owner, no migration needed.

### 4. Slim Electron build down to ~150 MB

Audit current `scripts/build-electron.cjs` + `electron:package:*` scripts and tighten:
- Confirm `--prune=true` actually runs (sometimes silently skipped when `node_modules` has dev deps interleaved). Force `npm prune --omit=dev` against a staging copy before packaging.
- Expand `--ignore` list: `^/supabase$`, `^/ios-native$`, `^/scripts$`, `^/electron-release$`, `^/dist-ssr$`, `\.map$`, `\.md$`, `^/\.git`, `^/\.github$`, `^/docs$`, `^/tests?$`, `^/\.vscode$`, `^/native/.*/(build|src|obj)$` (keep only the platform-matching `prebuilds/` dir).
- Enable `--asar=true` (or confirm enabled) with `--asar.unpack=native/win-audio-capture/prebuilds/**` so the WASAPI addon stays loadable.
- Keep `electronLanguages: ["en-US"]` and verify it's applied at packaging time (currently in `build` block, not in the `@electron/packager` CLI — pass `--electron-language=en-US` or strip extra `locales/*.pak` post-package).
- Strip `LICENSES.chromium.html`, `*.pdb`, leftover `swiftshader/` if unused.
- Print `du -sh` of the packaged folder in the build script so size regressions are visible.

Target: the unpacked tree under ~150 MB and the resulting NSIS/zip noticeably smaller than current.

### 5. Full Unicode emoji set in reactions

`FullEmojiPicker.tsx` ships a hand-curated subset (~400 emojis). Replace with the full standard set:

- Add a tiny dependency: `unicode-emoji-json` (pure JSON, ~90 KB gzipped) — gives all emojis with group + subgroup + name.
- Rebuild `FullEmojiPicker` around its data: render Discord-style category tabs (Smileys, People, Animals, Food, Activities, Travel, Objects, Symbols, Flags) sourced from the JSON's `group` field, virtualized grid so the longer list still scrolls smoothly.
- Implement real keyword search using the JSON's `name` / `slug` fields (the current picker has no search index).
- Keep the existing `onPick(emoji)` contract so `EmojiReactionPicker`, message composer, and any other call sites work unchanged.

### Out of scope
- No version bump (still v0.3.17 per project rules).
- No changes to the iOS app.
- No changelog wording yet — will be added once implementation lands.

### Technical notes
- Mention token format `<@uuid>`: matches Discord; one regex `/<@([0-9a-f-]{36})>/g` handles parse + render + notification check.
- `dm_preferences` upserts use `(user_id, conversation_id)` as the conflict target — confirm a unique index exists; if missing, add a migration with the required `GRANT`s.
- `notify()` already has a `force` flag; no API change needed there.
- For the muted-bell icon, reuse the existing `bell-off` lucide icon already imported elsewhere to avoid asset bloat.