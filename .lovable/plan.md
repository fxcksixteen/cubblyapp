Root cause found: the new `profiles.last_seen_at` heartbeat only updates for clients running the new v0.3.2 code. Older desktop/web clients already write `user_sessions.last_seen_at` when they open the app, but `online_user_ids()` ignores `user_sessions`, so those people can still show offline even though their desktop app is active.

Plan for v0.3.2 presence fix:

1. Make the database function truly version-tolerant
- Update `online_user_ids()` so online means either:
  - `profiles.last_seen_at` is fresh, or
  - any non-revoked `user_sessions.last_seen_at` for that user is fresh.
- Keep `status = invisible` hidden.
- Keep CubblyBot always online so it does not depend on stale timestamps.

2. Make heartbeat update both existing database signals
- Update `presence_heartbeat()` to refresh `profiles.last_seen_at` and the current session row when a session key is provided.
- Update the client heartbeat call to pass the existing `session_key` from `sessionTracker`.
- Update `registerSession()` to also refresh `profiles.last_seen_at` immediately, so opening desktop/web marks the user online right away.

3. Stop realtime presence from corrupting the online list
- Remove the `global:online` channel from the authoritative online calculation in `AuthContext`.
- Presence will be database-only for UI status indicators; realtime can no longer flap people offline/online.
- Keep polling the database and wake/focus refreshes for fast recovery after sleep/resume.

4. Verify with live backend data
- Check the database counts before/after the migration.
- Confirm users with recent `user_sessions.last_seen_at` are returned by `online_user_ids()` even if their `profiles.last_seen_at` is stale.
- Confirm the client uses the DB result only for friend/member/status indicators.

This directly fixes the current desktop app issue without requiring everyone to already have the newest client, because active older clients with recent session records will count as online.