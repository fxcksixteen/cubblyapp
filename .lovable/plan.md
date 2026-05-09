# v0.3.2 Hotfix Plan

Five urgent bugs across presence, voice calls, and personal notes. All scoped to client/Edge — no schema changes (one column added for note attachment positions).

---

## 1. Status indicators flapping online ↔ offline

**Root cause (from console logs):** `global:online` channel reports `CLOSED` every ~1s in an infinite loop. `subscribeWithReconnect` rebuilds it, the watchdog ALSO disconnects/reconnects the realtime socket on `socket-close`, the reconnect re-fires `socket-close`, and we get a tight race that prevents the channel from ever reaching `SUBSCRIBED`. With the channel never stable, presence sync drops users every cycle. The 10s offline grace helps but on bad networks the channel never recovers.

**Fix:**
- In `src/lib/realtimeReconnect.ts`: stop disconnecting the realtime socket inside the watchdog on `socket-close`/`socket-error` — those events fire DURING normal reconnects and create the loop. Only force a socket reconnect on `online`, `visibilitychange→visible`, `focus`, AND when the 30s interval check finds the socket actually closed while visible. Remove the `onError`/`onClose` → `fireWake` hooks entirely.
- Debounce `cubbly:realtime-wake` (≥2s) so a flurry of events doesn't re-tear-down healthy channels.
- In `subscribeWithReconnect`: ignore `CLOSED` if it arrives within 500ms of subscribe (it's the rebuild itself, not a failure).
- In `AuthContext` presence effect: use a single stable `presenceKey` per session (current `${user.id}:${uuid}` is fine) but DON'T recreate the channel on every `cubbly:realtime-wake` — let supabase-js auto-rejoin. Re-`track()` on visibilitychange instead of full rebuild.
- Bump `PRESENCE_OFFLINE_GRACE_MS` from 10s → 20s as additional safety.

---

## 2. Rejoin call doesn't put user back into the call

**Symptoms:** When the last remaining user leaves and another tries to rejoin via the call pill, the call event stays `ongoing` but the rejoiner doesn't actually enter — no participant row, no audio.

**Investigation needed in `GroupCallContext.tsx`:**
- `acceptCall` only runs for `incomingCall`; rejoin via the pill takes a different path (likely `startCall` with the existing conversation). Need to verify `startCall` reuses the existing `ongoing` `call_event` instead of creating a new one and that `joinCallChannel` correctly inserts a `call_participants` row with `left_at = NULL`.
- Also check the active-call timer — user reports the call "doesn't stay counting time" when one user is alone, suggesting `started_at` is being reset or the timer reads the wrong row.

**Fix:**
- Add a `rejoinCall(conversationId)` path that:
  1. Looks up the existing `ongoing` `call_event` for this conversation.
  2. If found, reuses its `id` (don't insert a new event).
  3. Calls `heartbeat_call_participant` to upsert our row with `left_at=NULL`.
  4. Joins the WebRTC mesh channel.
- Wire the call-pill "Join" button to `rejoinCall` (currently calls `startCall`).
- Fix the duration counter to read `call_events.started_at` for the row that's still `ongoing`, regardless of who is in it.

---

## 3. Call pill in chat sometimes disappears after a 2-person call ends

**Likely cause:** The pill is rendered from a `messages` row of type "call" OR the live `call_events` row. When `end_call_event_if_stale` runs it sets `state='ended'` but if the UI's `useMessages`/realtime listener gets a DELETE event (or the event row isn't read because `state != ongoing`), the pill vanishes.

**Fix:**
- Render the call pill from a permanent `messages` row inserted at call start (system message with `metadata.call_event_id`). End-of-call updates the message metadata with `ended_at` + duration, never deletes it.
- If we already have such a row, audit the realtime subscription — confirm we're not accidentally filtering ended call rows out (e.g. `where state='ongoing'`).

I'll inspect `ChatView.tsx` + the call-pill component first to pick the minimum-invasive variant.

---

## 4. Game streaming tanks both clients' calls

**Root cause:** Game capture path uses `getDisplayMedia` with default constraints (1080p60 + ≥5 Mbps). On the encoder side this saturates CPU; on the receive side, decoding a high-bitrate stream alongside voice causes both audio jitter buffers to underrun → the "lag" both users see. The "quality" picker only sets a label, it doesn't actually clamp the sender encoding.

**Fix in `GroupCallContext.tsx` screenshare path:**
- When the source is a game window (already known via `ScreenSharePicker`), apply hard caps:
  - `applyConstraints({ width: 1280, height: 720, frameRate: 30 })` on the captured track.
  - On the `RTCRtpSender` for the video transceiver, call `setParameters` with `encodings: [{ maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 }]` for "high", `800kbps@30/720p` for "medium", `400kbps@15/480p` for "low".
- Mark the screenshare transceiver `contentHint = "motion"` so encoders prioritize framerate over fidelity instead of vice versa.
- Disable simulcast on screenshare (it doubles encoder cost for no gain in 2-person calls).
- Verify the audio transceiver isn't being downgraded when video is added (check `addTransceiver` ordering).

---

## 5. Personal notes: rich, draggable attachments inside the note

**Today:** Attachments render as plain filename chips below the note body.

**Target:** Images/videos/PDFs render inline as draggable cards within the note canvas; images open in `ImageLightbox`, videos in `VideoLightbox` (same components as chat).

**Schema (one migration):**
- Add `attachment_layout JSONB` to `notes` (or to a side table if we prefer). Stores `[{ path, type, x, y, w, h, z }]`. Keep encrypted-at-rest by storing it inside the existing ciphertext payload — no schema change needed if we extend the JSON shape that's already encrypted. **Preferred: extend the ciphertext JSON, no migration.**

**Frontend changes (`NotesView.tsx` + `NotesContext.tsx`):**
- Decrypted note shape becomes `{ body: string, attachments: Array<{ id, path, mime, x, y, w, h }> }`.
- Render an absolutely-positioned layer over the note body containing one card per attachment:
  - `image/*` → `<img>` thumbnail, click opens `ImageLightbox`.
  - `video/*` → `<video>` poster + play, click opens `VideoLightbox`.
  - `application/pdf` → PDF.js mini-preview (or first-page thumbnail via `<embed>`), click opens fullscreen.
  - other → existing file chip.
- Drag: pointer events (works on mouse + touch + Pencil). Throttle position updates; persist on `pointerup` via `updateNote`. iOS PWA: use `touch-action: none` on the drag handle to prevent page scroll while dragging.
- Resize: corner handle, same persistence model.
- Add a "Reset layout" button in the note header.

**Acceptance:** Open a note with image+pdf+video on web/desktop and iOS PWA; drag each card; positions persist; lightboxes work.

---

## Technical notes

- Files touched: `src/lib/realtimeReconnect.ts`, `src/contexts/AuthContext.tsx`, `src/contexts/GroupCallContext.tsx`, `src/components/app/ChatView.tsx` (call pill), `src/components/app/NotesView.tsx`, `src/contexts/NotesContext.tsx`, `src/lib/notesCrypto.ts` (to extend payload shape).
- No DB migrations required if note layout rides inside the existing encrypted blob (preferred).
- Bump `package.json` to `0.3.2` and append a changelog entry.

## Out of scope

- Full WebRTC SFU rewrite (would fix screenshare perf more thoroughly, but too big for this hotfix).
- Server-side presence (would solve flapping permanently — track separately).
