I’ll fix the native iOS v0.1.4 calling system against the current desktop/web/PWA signaling behavior, then package a fresh Xcode-ready folder only after the code path is cleaned up and verified as far as this environment allows.

Scope:

1. Align iOS signaling with desktop/web
- Update native iOS `CallStore` so outgoing calls follow the web flow: create the call event, ring the peer, wait for the peer to accept/ask for an offer, then create/send the WebRTC offer.
- Keep compatibility for offers that arrive immediately, but make iOS primarily use the current `ready-for-offer` handshake that web/desktop now uses.
- Include the same payload fields web expects: `senderId`, `senderName`, `callerAvatarUrl`, `callEventId`, `conversationId` where needed.

2. Fix native iOS incoming-call acceptance
- When accepting a ring, iOS will join the per-call realtime channel, create its mic peer connection immediately, heartbeat into the correct `call_participants` row, and broadcast `ready-for-offer` if no offer was already provided.
- If an offer exists, iOS will answer it normally.
- This makes iOS able to answer web/desktop calls and actually form the peer connection instead of showing call UI without a real connected peer.

3. Fix WebRTC negotiation on iOS
- Update the iOS `WebRTCClient` setup to mirror browser negotiation more safely under Unified Plan.
- Add proper audio/video transceivers so iOS can send mic audio and receive browser-side camera/screenshare tracks without mismatched SDP lines.
- Patch SDP where needed for Opus/browser compatibility, while avoiding any changes to the existing native window screenshare audio system on desktop/web.

4. Fix call lifecycle parity
- Change iOS hangup behavior to match recent web behavior: peer leaving should close the peer connection and remote media, but not instantly destroy the entire ongoing call for the remaining participant unless the local user leaves.
- Preserve heartbeat/liveness so the join/rejoin pill stays accurate across platforms.
- Make iOS send the same lightweight peer state updates for mute/deafen so desktop/web participant UI can stay in sync.

5. Add reliability guards and diagnostics
- Add targeted native logs around signaling subscription, ready-for-offer, offer/answer, ICE candidate exchange, ICE selected state, and peer connection state.
- Avoid logging sensitive tokens, backend URLs, raw credentials, IP-like candidate addresses, or any unnecessary doxxing-style information.

6. Package a fresh Xcode-ready folder
- After the code changes, create a new versioned zip under `/mnt/documents/` containing the iOS native project folder for Xcode.
- Exclude unnecessary local/build/cache folders and avoid including secrets or personal machine paths.
- I’ll return the downloadable artifact link only after packaging is complete.

Important note:
- I’m currently in read-only Plan Mode, so I can’t edit files, run checks, or create the zip yet. Once you approve this plan, I’ll implement the patch and package the Xcode folder.