## v0.3.20 — final polish pass

Three deliverables, all scoped to this patch.

### 1. Server members panel — collapsible + right-click

- Add a `showServerMembersPanel` state in `ServerView.tsx` (default `true`), with a header toggle button that matches the group-chat Members icon (`friendsIcon`) and active-state styling already used in `AppLayout.tsx`. Toggle lives in the channel header area so it's discoverable in the same spot as the group equivalent.
- Wrap each member row in `ServerView.tsx` AND `GroupMembersPanel.tsx` with a shared `MemberContextMenu` (new file `src/components/app/MemberContextMenu.tsx`) using the same shadcn `ContextMenu` primitives as `DMSidebar.tsx`. Items:
  - **Message** — opens / creates a DM via `create_dm_conversation` and navigates to it
  - **View Profile** — opens the existing `UserProfileCard` modal
  - **Copy Username** / **Copy User ID**
  - **Mention in chat** (only when inside a chat context — passes `@user` into the active composer via existing mention plumbing)
  - **Mute** — quick mute of that user's voice (server panel only, when in a voice channel)
  - Owner-only destructive section: **Kick** (group) / **Remove from server** (server)
- Left-click on a row still opens `UserProfileCard` so behavior matches DM avatars.

### 2. Share Note modal redesign (`ShareNoteModal` in `NotesView.tsx`)

Replace the current 2-step ugly modal with a single cleaner sheet:

- **Layout**: rounded-2xl modal, sticky search bar at top (filter recipients by name), recipient list below as compact rows with avatar + display name + subtle username.
- **Multi-select**: each row toggles a selection state; selected rows show a check chip on the right and a soft primary tint. Selected recipients appear as removable pills above the list. Send button shows `Send to N`.
- **View-once toggle**: replace the square HTML checkbox with the existing shadcn `Switch` component (iOS-style toggle), labelled "View once" with a small "burns after one read · copy disabled" subtext.
- **Note preview card**: small card at the very top showing the note title + first line of body so the sender knows what they're about to send.
- **One-step send**: no second confirmation screen — just the primary "Send" button (loop the insert across all selected `conversation_id`s in parallel). Toast says "Shared with N chats".
- Keep the existing `[[cubbly:shared-note:v1]]` wire format; just send one message per recipient.

### 3. Shared-note message rendering (`SharedNoteMessage.tsx`)

Redesign the in-chat card so it never looks like pasted text:

- **Card style**: larger rounded-2xl card, ~380px max, layered background (subtle gradient using `--app-bg-secondary` → `--app-bg-tertiary`), 1px border in `--app-border`, soft shadow. Header strip with a small accent bar (primary for normal, amber `#f0b132` for view-once) and a notebook/paper icon mark.
- **Header row**: `Shared note` (or `View-once note`) label in uppercase 10px, then the bold title, then a meta line with the sender's display name + relative time.
- **Body preview**:
  - Normal share: 3-line clamped preview of the note body with a fade-out gradient at the bottom and an "Open note" pill on hover.
  - View-once unopened: body fully redacted with a blurred shimmer placeholder + lock icon + "Tap to reveal once" label.
  - View-once opened (burnt): grayscale card, struck-through title, "Already opened" tag, button disabled.
- **Open viewer**: keep the existing modal but upgrade visuals — paper-like surface, real prose typography, and the view-once lock badge in the header. Locks already implemented (block copy/cut/select/contextmenu/drag, global Ctrl+C/X/A while open) stay in place; add `onSelectStart` block and a top-level overlay div with `pointer-events` checks to fully bulletproof against drag-to-select-screenshot text grabbing.
- **Bulletproofing**:
  - Store `seen` state keyed by message id in localStorage AND in a `sessionStorage` mirror so re-opening the tab can't trivially unburn it.
  - Add a tiny RPC-free safeguard: when a view-once note is opened, immediately overwrite the message content in the DB with a sentinel `[[cubbly:shared-note:v1]]{"viewOnce":true,"burnt":true,"title":"…"}` (sender remains the owner; we only burn from the recipient side using a new RLS-safe RPC `burn_view_once_note(message_id)` that only allows the recipient of the note to set the burnt flag).
  - Renderer treats `burnt:true` as terminal — no body ever rendered again, even if the localStorage cache is cleared. This is the actual bulletproof piece.

### Backend

One small migration:

- New SQL function `burn_view_once_note(_message_id uuid)` — `SECURITY DEFINER`, validates that the caller is a participant in the conversation and is NOT the sender, then updates `messages.content` to the burnt sentinel. `GRANT EXECUTE TO authenticated`.

### Wrap-up

- No version bump (still v0.3.20).
- Changelog: add one new-feature line ("Share notes to multiple chats at once with a cleaner picker and iOS-style View Once toggle") and one bug-fix line ("Shared notes now render as a proper card in chat instead of pasted text, and view-once notes burn permanently on the server after first open"). Existing "View Once" line will be merged into the new one.
