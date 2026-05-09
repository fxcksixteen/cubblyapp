## What’s wrong

- Presence is database-backed, but each app instance only reconciles from the database on a 20s poll/focus/refresh. That means desktop and web can temporarily show different friend presence until one of them polls or refreshes.
- The live backend is healthy, and current live data only has 1 user inside the 75s online window. Older desktop sessions from friends are stale by minutes, so the backend is correctly treating them offline unless their app is actively updating `user_sessions.last_seen_at`.
- Notes images are still modeled as attachments rendered in a separate preview strip above the note body. Dragging only reorders that strip; it does not insert or place images at the cursor/drop location inside the editable note content.

## Plan

1. **Make presence instantly converge across desktop and web**
   - Keep `online_user_ids()` as the database source of truth.
   - Add a lightweight database realtime listener for relevant presence changes from `profiles.last_seen_at/status` and `user_sessions.last_seen_at/revoked_at`.
   - On any relevant database change, immediately refetch `online_user_ids(75)` instead of waiting for the next poll.
   - Keep the poll as a fallback, but reduce visible drift by refreshing on wake/focus/visibility and by preventing overlapping stale fetches from overwriting newer results.

2. **Clean up the presence RPC ambiguity**
   - Replace the duplicate `presence_heartbeat()` overloads with one canonical function that accepts an optional session key.
   - This keeps old no-argument calls working while ensuring new session-aware clients update both `profiles` and `user_sessions` consistently.
   - Verify the live function list only has the intended canonical heartbeat behavior after migration.

3. **Make notes images actually live inside the note body**
   - Change image upload insertion so image attachments can be inserted at the current caret/drop position inside the contenteditable editor.
   - Store inline image markers in the encrypted note HTML, referencing encrypted attachment metadata by id.
   - Render those markers as draggable inline/block image elements inside the editor, not just in the attachment strip.
   - Support drag/drop repositioning within the note body using caret/drop coordinates, and update the encrypted HTML immediately so placement persists.

4. **Keep non-image files as normal attachments**
   - PDFs/videos/other files can remain in the attachment area for now unless they need inline placement later.
   - Images that are already attached but not inline will still be shown, with a way to insert/place them into the body rather than being stuck only at the bottom/top strip.

5. **Validate the fix**
   - Query the backend to confirm presence RPCs and current online calculation behave as expected.
   - Check the browser console/network signals for errors after the code changes.
   - Confirm notes image upload, drag placement, autosave, and reload persistence work in the editor.