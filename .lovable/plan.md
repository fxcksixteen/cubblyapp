## v0.3.9 hotfix plan

I’m going to treat this as three regressions and keep the release narrow: no feature work, no version past `0.3.9`.

### 1. Fix the 1:1 call join regression

**Goal:** when one person starts a DM call and the other joins/accepts, both users reliably land in the same live call.

Planned changes:
- Stop relying on fragile “fresh participant” checks during the active join handshake to decide whether the receiver should reuse the current call. That v0.3.7 liveness gate is too aggressive for the ring/join window.
- Make every voice signaling payload scoped to the exact `callEventId`, not just `peer-leave`:
  - `ready-for-offer`
  - `offer`
  - `answer`
  - `ice-candidate`
  - `peer-leave`
- Ignore stale signaling packets from older call attempts before they touch the current peer connection.
- Make the caller create/recreate the offer whenever the accepted peer sends `ready-for-offer`, even if old signaling state is hanging around.
- Ensure both caller and receiver write/heartbeat their `call_participants` rows immediately on start/accept and continue during “calling/ringing”, not only after ICE connects.
- Keep `end_call_event_if_stale` only for truly old ghost events, not brand-new or currently-ringing events.

Technical target files:
- `src/contexts/VoiceContext.tsx`
- possibly `src/components/app/ChatView.tsx` if rejoin detection is falsely hiding/joining the wrong event

### 2. Fix Personal Notes attachments visibility

**Goal:** old and new note attachments must show in the note, even if they use legacy metadata or fail inline hydration.

Planned changes:
- Expand note plaintext normalization beyond `attachments` to also recover legacy arrays/keys like `files`, `media`, `images`, `file`, `filename`, `storage_path`, signed URLs, and object URLs where possible.
- Make the editor’s attachment strip show all attachments, including media that is already referenced inline, so a broken inline image can’t make the file look like it disappeared.
- When inline media hydration fails, keep a visible attachment card with download/delete/insert actions instead of silently ignoring it.
- Preserve encrypted download behavior, but keep the existing raw-blob fallback for legacy unencrypted files.

Technical target files:
- `src/contexts/NotesContext.tsx`
- `src/components/app/NotesView.tsx`

### 3. Slim the desktop package correctly

**Goal:** stop shipping a 700+ MB desktop build caused by packaging unnecessary project/dependency files.

Planned changes:
- Change the Electron build script to stage a minimal desktop app folder before running the installer build.
- Stage only:
  - `dist/`
  - `electron/*.cjs`
  - required icon/assets
  - `native/win-audio-capture` prebuilds
  - runtime Electron deps only (`electron-updater`, `electron-log`, `electron-store`, and their required runtime deps)
- Prevent frontend/dev deps, source files, native build sources, caches, and full root `node_modules` from being swept into the installer.
- Keep auto-updater and Windows audio capture working.

Technical target files:
- `scripts/build-electron.cjs`
- `package.json` build config/scripts if needed

### 4. Release bookkeeping

- Bump `package.json` to `0.3.9` only.
- Add a `0.3.9` changelog entry describing the call join fix, notes attachment fix, and desktop size fix.
- Avoid touching unrelated UI/features.