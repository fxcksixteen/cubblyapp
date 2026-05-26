## Plan

### 1) Fix real-user voice calls joining the wrong/no call
- Update the iOS chat call button flow so it first checks for an existing live `call_events` row before starting a new call, matching web/desktop behavior.
- Make the active call pill join path use the exact `call_event_id` the user tapped instead of only looking up “latest ongoing”, so it cannot accidentally create or join a separate call.
- Align iOS signaling state with web/desktop for rejoin/answer flows:
  - preserve the live `callEventId` through `ready-for-offer`, `offer`, `answer`, and ICE exchange
  - reset stale peer connections before rejoining
  - keep the caller in the existing call while waiting alone, but allow the other device to rejoin that same call
- Ensure iOS sends and responds to `ready-for-offer` with sender metadata and call event metadata compatible with web/desktop.
- Keep the CubblyBot loopback path untouched except where shared call-state fixes require it.

### 2) Add native iOS Personal Notes synced with web/desktop
- Add a new **Personal Notes** tab in the iOS bottom bar between Friends and Shop, matching the web/desktop navigation placement.
- Implement an iOS notes vault service using the existing backend tables and storage:
  - `notes_keys` for the existing per-user PIN verifier
  - `notes` for encrypted note rows
  - `notes-attachments` for encrypted files/attachments
- Port the web encryption format exactly so the same 4-digit PIN unlocks the same notes across iOS, web, and desktop:
  - PBKDF2-SHA256
  - 250,000 iterations
  - AES-GCM
  - same verifier plaintext: `cubbly-notes-v1`
  - same base64 encoding for salt, IV, ciphertext, attachments
- Add native iOS lock/setup screens:
  - create PIN when the user has no vault
  - confirm PIN on setup
  - unlock existing vault with the same PIN
  - optional “trust this device” behavior using Keychain-backed secure storage
  - lock and forget trusted device actions
- Add a clean mobile notes UI:
  - list of notes
  - create note
  - open/edit title and body
  - autosave updates
  - pin/unpin notes
  - delete notes with confirmation
  - empty/loading/error states
- Keep rich web HTML note bodies compatible: display/edit body text safely on iOS while preserving stored HTML enough that notes remain usable on web/desktop.
- Add attachment support where practical for v0.1.6 parity:
  - pick files/photos from iOS
  - encrypt before upload
  - store attachment metadata in the note payload
  - download/decrypt existing attachments

### 3) Version/package after implementation
- Bump the iOS build number to the next v0.1.6 build.
- Package the updated iOS source zip after code changes are complete.

## Technical details
- No database schema changes are needed; the existing `notes`, `notes_keys`, and `notes-attachments` backend objects already support this.
- The iOS notes encryption will be implemented with CryptoKit/CommonCrypto-compatible native code so ciphertext remains cross-platform compatible with Web Crypto.
- The call fix will stay inside the iOS native call/chat/signaling files and will not change web/desktop call logic.