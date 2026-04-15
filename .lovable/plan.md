

## Plan: Fix Call Event Pills, Custom SVG Icons, and Audio Level Indicators

### Problem Analysis

1. **Call event pills not appearing in chat**: The `callEvents` state lives in `VoiceContext` (in-memory only) and resets on re-render/navigation. More critically, the call events are only appended at the bottom of the chat items list (after all messages), but the real issue is that `callEvents` is tracked via `prevCallStateRef` which may not trigger properly — the call with CubblyBot is likely client-only and never reaches "connected" state, so no event is ever created. The fix: create the call event immediately when a call starts (not just on "connected"), and persist events so they survive.

2. **Mute/Deafen buttons using Lucide icons instead of custom SVGs**: The call UI uses `Mic`, `MicOff`, `Volume2`, `VolumeX` from lucide-react. Should use `microphone.svg`, `microphone-mute.svg`, `headphone.svg`, `headphone-deafen.svg`.

3. **No remote audio level detection**: Currently only local `audioLevel` is tracked. Need to add a `remoteAudioLevel` by creating an analyser on the remote stream too.

### Changes

**`src/contexts/VoiceContext.tsx`**
- Create a call event as soon as `startCall` is invoked (state: "ongoing"), not waiting for "connected"
- End the call event when `endCall` is called — update the last ongoing event to "ended"
- Remove the fragile `prevCallStateRef` approach
- Add `remoteAudioLevel` state + analyser for the remote stream's audio in `ontrack`
- Export `remoteAudioLevel` in context

**`src/components/app/VoiceCallOverlay.tsx`**
- Replace `Mic`/`MicOff` with custom `microphone.svg`/`microphone-mute.svg` as `<img>` tags
- Replace `Volume2`/`VolumeX` with custom `headphone.svg`/`headphone-deafen.svg` as `<img>` tags
- Keep all layout, sizing, coloring, and button structure identical — just swap the icon content
- Add `remoteAudioLevel` from `useVoice()` and apply the same green speaking-ring glow to the recipient's avatar when their audio level exceeds the threshold
- Apply CSS `filter` for icon color changes (white by default, red-tinted when muted/deafened)

**`src/components/app/ChatView.tsx`**
- Interleave call events with messages by timestamp instead of appending at end
- This ensures pills appear in chronological order within the chat

### Technical Details

- Custom SVG icons will use `<img>` with `filter: brightness(0) invert(1)` for white, and a red filter variant when active
- Remote audio analyser: create a second `AnalyserNode` on the remote stream in `ontrack`, run a separate RAF loop updating `remoteAudioLevel`
- Call events: generate on `startCall`/`acceptCall`, finalize on `endCall` — simple and reliable

### Files Modified
- `src/contexts/VoiceContext.tsx`
- `src/components/app/VoiceCallOverlay.tsx`
- `src/components/app/ChatView.tsx`

