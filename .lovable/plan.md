# Cubbly — Backend Cost Audit & Recommended Cleanups

A full sweep of Lovable Cloud usage (database, realtime, edge functions, storage, client polling). The current footprint is small (DB 19.7 MB, ~3.7K messages, 6 active users) but several patterns will bleed money as you scale. Findings ranked by likely cost impact.

---

## 1) Database health red flags

From `db_health` + storage inspection:

- **Rolled-back transactions since boot: 1,590,173.** That is *enormous* for a DB with 3.7K rows. Almost certainly an upsert hitting a unique constraint over and over (most likely candidates: `accrue_message_coins` trigger, `push_subscriptions` upsert on web, `heartbeat_call_participant` upsert during call). Each rolled-back txn still writes to WAL and burns CPU.
- **WAL size: 144 MB vs DB size: 19.7 MB** (≈7× the database). Driven by the same churn: `profiles.last_seen_at` UPDATE every 30s per session, plus the rolled-back txns above. WAL bloat → bigger backups → bigger disk → bigger bill.
- **Memory 62%** — fine now, but presence/realtime fanout grows with users.

**Action**

- Enable Postgres query logging for one hour and capture which statement rolls back most. (We'll do this via `analytics_query` over `postgres_logs`.) Patch whichever it is.
- Confirm `accrue_message_coins` trigger doesn't run for bot/self.
- Switch `presence_heartbeat` from a per-row UPDATE on `profiles` to writing to `user_sessions` only (already happens); stop bumping `profiles.last_seen_at` from the client every 30s — derive presence from `user_sessions.last_seen_at` in `online_user_ids` (it already does, redundantly).

---

## 2) Client polling cadence (drives WAL + realtime + DB egress)

Per active web/desktop tab, today:

| Loop | Cadence | RPC |
|---|---|---|
| `AuthContext.heartbeat`    | 30 s | `presence_heartbeat` → UPDATE `profiles` + `user_sessions` |
| `AuthContext.fetchOnline`  | 20 s | `online_user_ids` |
| `AuthContext` profile-UPDATE realtime watcher | per event | re-fires `fetchOnline` (no filter) |
| `CoinsContext` accrue      | 60 s | `accrue_activity_coins` |
| `ActivityContext` electron poll | 60 s | upsert `user_activities` (if change) |
| `realtimeReconnect` watchdog | 30 s | local socket check (cheap) |

The killer is the **AuthContext profile-UPDATE handler**: every time *any* user's `profiles` row updates (i.e., every 30s per user globally), every signed-in client schedules a `fetchOnline()`. With N concurrent users that's O(N²) RPC calls per minute.

**Action**

- Remove the profile-UPDATE realtime listener from `AuthContext`; trust the 20s `fetchOnline` poll. (Or, keep realtime but rely on it instead of polling — pick one, not both.)
- Bump `fetchOnline` to 60 s. Status indicators rarely need sub-minute accuracy.
- Keep `presence_heartbeat` at 30 s but stop updating `profiles.last_seen_at` inside it — only touch `user_sessions`. That kills the realtime fanout entirely and shrinks WAL.

Expected impact: ~70% fewer DB RPCs at idle, dramatic WAL shrinkage, far fewer realtime egress messages.

---

## 3) Realtime publication is too broad

`supabase_realtime` currently broadcasts 14 tables. Some are essential (`messages`, `call_events`, `call_participants`, `conversations`, `conversation_participants`, `friendships`, `message_reactions`). The chatty/unnecessary ones:

- **`profiles`** — only needed for status, and only as a fallback. Removing fixes the cascade above.
- **`user_activities`** — currently broadcast to every signed-in client with no filter; every Electron user emits an upsert/delete on every game change, fanned out to everyone. Cap to friends only (filter `user_id=in.(my-friends)`) or fall back to a periodic poll.
- **`servers`, `server_channels`, `server_members`** — fine to keep; small volume.
- **`user_equipped`, `user_inventory`** — only needed for the current user; if not filtered, you're fanning every shop equip to every client. Confirm filters in code or drop from publication.

**Action**

- Drop `profiles` and `user_activities` from `supabase_realtime`. Refetch on focus + on a 60 s timer instead. Realtime is billed per message broadcast.

---

## 4) Edge functions

Per function review:

- **`link-preview`** — invoked per URL per chat render, cached *only in memory* for the current tab. Every refresh re-invokes every link, every device re-invokes everything. Each invocation also does a 512 KB HTTP fetch from your egress.
  - **Fix**: persist a `link_previews` table keyed by URL hash with `{title, description, image, site_name, fetched_at}` and a 30-day TTL. Edge function reads from cache first, only fetches on miss.
- **`giphy-search`** — fine; user-initiated, auth-gated, no caching needed (Giphy is free up to limits).
- **`send-apns-push` / `send-push-notification`** — invoked by the `notify_push_on_message` DB trigger **once per recipient per message**, with **no skip for online recipients**. Every message in a 5-person group = 4 edge invocations even if everyone is staring at the chat.
  - **Fix**: in `notify_push_on_message`, skip recipients whose `profiles.last_seen_at > now() - interval '30 seconds'` AND who are currently in that conversation (check `conversation_participants.last_read_at`). Cuts push invocations by ~80% in active chats.
- **`chat-with-bot`** — only called when user messages the bot. Fine.
- **`discord-template`**, **`login-with-username`**, **`get-turn-credentials`**, **`get-vapid-public-key`** — low-volume, fine.

---

## 5) Storage: no upload caps, duplicate uploads, no lifecycle

Current footprint:

| Bucket | Files | Size |
|---|---|---|
| chat-attachments | 103 | 167 MB |
| avatars | 46 | 53 MB |
| notes-attachments | 10 | 33 MB |

Concerns:

- **Raw videos uploaded full quality** — multiple 10–13 MB `.mov` files from iOS, one `.mp4` at 9.4 MB. iOS PhotosPicker delivers originals.
  - **Fix**: cap chat-attachment uploads at 10 MB; for videos, transcode/compress (iOS `AVAssetExportSession` with preset `HEVCHighest960x540` or `1280x720`) before upload — typically 70–85% size reduction.
- **Avatars up to 3.5 MB.** Web/desktop already compress, iOS doesn't.
  - **Fix**: cap avatars/banners at 500 KB after JPEG re-encode at 0.85 quality and max 1024 px on the long edge. (Already partially done in `ProfilePhotoUploader.swift`; verify it actually downsizes.)
- **Six identical 4843 KB encrypted blobs in notes-attachments from the same user within 50 minutes** — looks like a re-save loop or failed-upload retry that didn't dedupe. Either a real bug or test data.
  - **Fix**: dedupe by hashing the encrypted blob client-side and reusing the existing path if a row with the same hash already exists for the user; or just garbage-collect orphans not referenced by any `notes` row.
- **No bucket lifecycle policy** — deleted notes/messages keep their attachments forever.
  - **Fix**: nightly edge function `cleanup-orphan-attachments` that deletes storage objects with no matching `messages.content` reference / no matching `notes.ciphertext` reference older than 7 days.

---

## 6) Triggers and RPCs

- **`accrue_message_coins`** runs on every `messages` INSERT. Cheap, but consider batching (every 100 messages already; OK). Confirm it short-circuits for the bot (it does — `_bot UUID` check).
- **`notify_push_on_message`** — see §4. Also wrap the loops in a `LIMIT` defensive guard so a runaway group with thousands of participants can't queue thousands of edge calls per message.
- **`heartbeat_call_participant`** — currently called every 10 s by both `VoiceContext` and `GroupCallContext`. That's fine during a call; just make sure both contexts aren't running simultaneously (would double the writes). Audit and consolidate.
- **`end_call_event_if_stale`** — relies on a client to invoke it. No `call_events` are stale right now, but you have **282 call_events rows** for ~6 users, all preserved indefinitely. Fine for analytics, but consider a 30-day TTL cleanup if you don't query them.

---

## 7) Misc

- **`coin_transactions`** has 397 rows for 6 users — small now, but it grows fast (every voice block, every message block). Add a quarterly partition / archive policy before it hits 100K rows.
- **`gif_favorites`** at 108 rows from a few users is fine; no concern.
- **No DB indexes audit found** in this scan — schedule `EXPLAIN ANALYZE` on the hot queries (`messages` infinite scroll, `online_user_ids`, `conversations` list) once user count grows; today the dataset is too small for it to matter.

---

## Quick-win priority list

If you only want to do three things this week, do these — they cover ~90% of avoidable cost:

1. **Patch `notify_push_on_message`** to skip recipients who are active in the conversation. *(Edge function invocations)*
2. **Drop the AuthContext profile-UPDATE realtime watcher**, raise `fetchOnline` to 60s, and stop bumping `profiles.last_seen_at` in `presence_heartbeat`. *(WAL + realtime egress + DB RPCs)*
3. **Add upload caps + iOS compression** for chat attachments and avatars; dedupe notes-attachments. *(Storage GB-months + egress)*

The deeper investigation (1.59M rolled-back txns, `link-preview` persistent cache, orphan-attachment GC) is worth doing next.

---

## Out of scope

- No UI changes.
- No new dependencies.
- No changes that risk breaking calls, messaging, or auth — every fix above is additive or a parameter tweak.
