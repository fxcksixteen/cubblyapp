# v0.4.15 — Hotfix: calls broken everywhere

## Root cause (confirmed via pg_get_functiondef)

`public.acquire_call_session` declares `RETURNS TABLE(call_event_id uuid, started_at timestamptz, is_creator boolean)`. Those OUT parameters live in the same name-resolution scope as the `call_participants` table columns. When the function runs:

```sql
INSERT INTO public.call_participants AS cp (call_event_id, user_id, ...)
ON CONFLICT (call_event_id, user_id) DO UPDATE ...
```

`ON CONFLICT (call_event_id, ...)` cannot be qualified with a table alias — Postgres therefore can't decide whether `call_event_id` is the column or the OUT variable, and throws `42702: column reference "call_event_id" is ambiguous`. The v0.4.14 attempt qualified INSERT columns but the ON CONFLICT list is still bare, so every call still 400s.

## Fix

Recreate the function with OUT parameter names that cannot collide with any `call_events` / `call_participants` column:

- `call_event_id` → `out_call_event_id`
- `started_at`    → `out_started_at`
- `is_creator`    → `out_is_creator`

Assign them at the end (`out_call_event_id := _event_id;` etc.). Function body otherwise unchanged, so no behavior/logic shift.

Callers in `src/contexts/VoiceContext.tsx` and `src/contexts/GroupCallContext.tsx` read fields by name from the returned row; update their destructuring / property access to the new names (`out_call_event_id`, `out_started_at`, `out_is_creator`).

## Ship

- Bump `package.json` and `src/lib/changelog.ts` to `0.4.15`.
- Changelog: one short bullet — "Fixed a bug that prevented calls from starting."
- Desktop-only patch (no web publish), per project convention.

## Verification

- Re-run `pg_get_functiondef` after migration to confirm new signature.
- Read both context files after edits to confirm no stale `call_event_id` / `started_at` / `is_creator` destructuring from the RPC response remains.