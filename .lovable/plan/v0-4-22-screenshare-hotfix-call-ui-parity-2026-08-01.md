# v0.4.22 — Screenshare hotfix + call UI parity

Screenshare works now, so this patch is about the rough edges around it: the capture border, the fullscreen viewer, stream stability, and the call UI for someone who left an ongoing call.

## 1. Remove the yellow capture outline

Windows draws that yellow border, not Cubbly. It comes from the Windows Graphics Capture session.

- Native capture path: turn the border off on the capture session (`IsBorderRequired = false`, available on Windows 11 / recent Win10 builds), guarded by an API-presence check so older builds still start capture normally. This is a small, additive change inside the existing hand-written module — no rewrite of the capture logic.
- Browser/Chromium capture path in the desktop app: disable Chromium's own WGC border by passing the matching feature flag alongside the existing GPU flags in the Electron startup switches.

## 2. Fullscreen viewer fixes

- Make the stream volume control **vertical**: replace the horizontal slider in the top-right with a vertical slider inside a small stacked panel (speaker icon + vertical track + percentage). Clicks and drags on it stop propagation so adjusting volume can never dismiss fullscreen.
- **Auto-exit when the stream ends**: watch the incoming stream's video track for `ended`/`mute` plus removal of the track from the stream, and call `onClose()` when the share disappears. Also close when the sharing peer is no longer listed as sharing, so a watcher never gets stranded on a black screen.

## 3. Stream causing call lag / unstable quality

- Give the microphone audio sender explicit high network priority and keep it out of the screen bandwidth budget, so the screen encoder can never starve voice.
- Start the screen sender at a sensible quality **immediately** instead of ramping from a low floor: set a start bitrate/resolution close to target on the first `setParameters` call rather than letting the adaptive loop discover it.
- Damp the adaptive loop: larger hysteresis band, slower step-downs, cooldown between adjustments, and no re-adjust while the encoder is still settling. That removes the back-and-forth "keeps changing quality" behaviour.
- Only cut quality on sustained congestion signals (multiple consecutive bad samples), not single RTT spikes.

## 4. Region back in call diagnostics

The Server section currently shows only transport / TURN host / relay protocol. Re-add a **Region** row derived from the selected ICE candidate pair's server (TURN/STUN host region hint), falling back to "—" when the connection is peer-to-peer with no region info.

## 5. Call UI for a user who left an ongoing call

Replace the plain "Ongoing call in this chat" banner with the real call panel in read-only form:

- Render the normal call UI, showing tiles only for the participants actually in the call (the user who left is not shown).
- Keep the mic/deafen/screen controls hidden or disabled in this state; the primary action is **Join Call**.
- On join, the panel transitions into the existing full interactive call UI with no second call event created.

Applies to both DM and group chats.

## 6. Multiple simultaneous screensharers

Verify and harden that every sharing participant gets their own track, tile, and fullscreen viewer in DM, group, and server calls — keyed by sharer user id rather than a single "active share" slot, including when a second person starts sharing after the first.

## Technical notes

- Files: `native/win-dxgi-capture/src/window_capture.cc` (border flag only), `electron/main.cjs` (feature flag), `src/components/app/FullscreenScreenShareViewer.tsx`, `src/lib/screenShareEncoding.ts`, `src/contexts/VoiceContext.tsx`, `src/contexts/GroupCallContext.tsx`, `src/components/app/CallDiagnosticsModal.tsx`, `src/components/app/ChatView.tsx`, `src/components/app/GroupCallPanel.tsx`, `src/components/app/ServerVoicePanel.tsx`.
- Version bump to 0.4.22 in `package.json` plus short user-facing changelog bullets in `src/lib/changelog.ts`. No web publish.
