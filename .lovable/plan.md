

## Final v0.2.5 fix — Speaking rings + folded changelog

### Issues found in the speaking-ring code

1. **Ring only updates locally for yourself, never reflects what the OTHER user actually hears.** Both 1:1 and group calls compute `audioLevel` from the *local mic capture* (you) and the *inbound remote audio track* (peer-as-heard-by-you). That part is fine in principle, but several bugs make it look broken in real calls:

2. **Bug A — Sensitivity gate kills the ring.** In `VoiceContext.tsx` line 450-460, when `autoSensitivity` is OFF, we set `track.enabled = false` whenever `audioLevel < threshold`. That means: peer's ring stops pulsing for you the instant you cross silence, AND your peer's ring stops pulsing for them because you literally stopped sending audio. Plus this re-runs every animation frame → constant track.enabled flapping → choppy ring.

3. **Bug B — Ring shown even while muted/deafened on the other side.** We gate the local ring on `!activeCall.isMuted`, but we gate the *peer* ring on `!peerState?.is_muted` which is sometimes undefined during the first 1-2s of a call (DB row hasn't synced and instant-broadcast hasn't fired yet). Result: peer's ring flickers ON for any background hiss right when call connects.

4. **Bug C — `remoteAudioLevel` analyser leaks + stops updating.** In `VoiceContext.tsx` `ontrack` (line 557-573), every new inbound audio track creates a NEW `AudioContext` and overwrites `remoteAnalyserRef.current` without cancelling the prior `requestAnimationFrame` loop. On reconnect or track replace this stacks loops and eventually one wins that points at a closed context → ring freezes at 0 for the rest of the call.

5. **Bug D — Group calls: peer monitor never restarts after a track replace (camera toggle, screen-share, reconnect).** `startPeerMonitor` is called once on `ontrack` for audio. If the same peer's audio track is replaced (network blip, renegotiation), the old analyser keeps reading from a dead source → that peer's ring goes flat permanently for the rest of the call.

6. **Bug E — Threshold of `> 5` is too low.** Background room noise commonly sits at ~3-8 on the 0-100 scale, so rings frequently glow even when nobody's talking. Discord uses ~10-12.

7. **Bug F — `requestAnimationFrame` keeps running when tab unfocused (Electron unfocused window throttles to 30fps from the v0.2.6 change). When focus returns, the ring suddenly jolts.** Need to also gate the analyser tick to only `setState` if value changed by >1, otherwise we re-render the entire CallPanel 60×/s for nothing.

### Fixes

**`src/contexts/VoiceContext.tsx`**
- Cancel any prior `remoteAnimFrameRef` and close prior remote `AudioContext` at the top of the audio-branch of `ontrack` before creating new ones.
- Sensitivity gate: throttle to only flip `track.enabled` when state *changes* (debounce 150ms), and skip the gate entirely while audio level isn't being monitored. This stops the ring choppiness.
- Threshold for visible ring: bump comparator from `> 5` to `> 10` in `VoiceCallOverlay.tsx` (both local and remote tiles).
- In analyser tick, only call `setRemoteAudioLevel`/`setAudioLevel` if `Math.abs(new - prev) > 1` to cut needless re-renders by ~95%.
- Ensure `is_muted` for peer falls back to `false` (not undefined) so we don't accidentally render a ring on call-connect noise; *combined with* the >10 threshold this fully fixes flicker.

**`src/contexts/GroupCallContext.tsx`**
- In `ensurePc` `ontrack`, when audio track received: call `audioCleanupRef.current.get(peerId)?.()` BEFORE starting the new monitor so replaces don't leak.
- Same setState-only-on-change optimization in `startPeerMonitor`.
- Add the same threshold bump in `GroupCallPanel.tsx` (>10 instead of >5).

**`src/components/app/VoiceCallOverlay.tsx` & `src/components/app/GroupCallPanel.tsx`**
- Update threshold checks (>10).
- Add CSS `transition: box-shadow 80ms linear` so the ring smooths between frames (no jitter even when the level updates only on >1 deltas).
- Make `speakingRingShadow` slightly more reactive: clamp level to [10, 100], normalize to 0..1, then scale ring radius from 4px → 14px and outer glow 12px → 32px with eased curve. Visually this gives Discord-style "pulse" feel.

### Changelog (`src/lib/changelog.ts`)

- **DELETE** the v0.2.6 entry entirely (we never shipped it — user is still finalizing 0.2.5).
- **MERGE** all v0.2.6 content into the existing v0.2.5 entry's `newFeatures` / `bugFixes`.
- **ADD** to v0.2.5 bug fixes:
  - "Fixed speaking rings around user avatars not pulsing reactively in real calls (now smoothly responds to volume for everyone in the call)"
  - "Fixed peer's speaking ring permanently freezing after a network blip mid-call"
  - "Fixed speaking rings flickering on background noise the moment a call connected"
- **BUMP** `CURRENT_VERSION` back to `"0.2.5"`.
- **REVERT** `package.json` and `src/main.tsx` from `0.2.6` → `0.2.5`.

### Files touched

- `src/lib/changelog.ts` — delete 0.2.6, merge into 0.2.5
- `package.json` — version → 0.2.5
- `src/main.tsx` — version constant → 0.2.5
- `src/contexts/VoiceContext.tsx` — analyser cleanup, debounced setState, sensitivity gate fix
- `src/contexts/GroupCallContext.tsx` — peer monitor cleanup before replace, debounced setState
- `src/components/app/VoiceCallOverlay.tsx` — threshold + ring transition + curve
- `src/components/app/GroupCallPanel.tsx` — same ring fix

### After

Once approved I implement all of this in one pass and give you the standard ship command:
```
git pull && npm install && npm run build:electron && BUILD_TARGET=electron npx electron-builder --win nsis --x64 --publish always
```

