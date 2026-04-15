

# Fix Voice System, Desktop UI, and Call Indicators

## Summary
Seven distinct issues across the voice pipeline, desktop app chrome, UI branding, and call overlay. All root causes identified in the codebase.

---

## 1. Fix "underwater" mic quality + non-functional voice settings

**Root cause**: The mic test in VoiceVideoSettings creates a raw `getUserMedia` stream with minimal constraints, then pipes it directly through `AudioContext` → `gain` → `destination`. Changing echo cancellation, noise suppression, or auto gain control in settings never calls `applyConstraints()` on the active stream, so toggling them does nothing. During actual calls, settings are baked in at `getUserMedia` time but never updated mid-call either.

**Fix** (in `VoiceVideoSettings.tsx` and `VoiceContext.tsx`):
- Mic test: pass `echoCancellation`, `noiseSuppression`, `autoGainControl` from current settings into the `getUserMedia` constraints
- When settings change during an active call or mic test, call `track.applyConstraints()` on the live audio track to apply changes in real-time
- Remove the gain node routing to `ctx.destination` in the mic test (this causes the "underwater" echo feedback loop) — instead use a separate analyser-only path for the level meter, and optionally play back through an `<audio>` element with proper constraints
- Add a `useEffect` in VoiceContext that watches `echoCancellation`, `noiseSuppression`, `autoGainControl` and calls `applyConstraints` on `localStream` audio tracks

**Sensitivity threshold fix**: Currently the threshold is display-only. Add logic in the audio level monitor that actually mutes the outgoing track when `audioLevel < sensitivityThreshold` (when `autoSensitivity` is off).

---

## 2. Stronger green speaking ring on profile pictures

**Current formula** (VoiceCallOverlay lines 133-135):
```
boxShadow: 0 0 0 ${4 + level*0.12}px rgba(59,165,92, 0.5+level*0.005)
```
At max level (100), this gives ~16px spread at 0.55 opacity — very subtle.

**New formula**: Much more visible ring:
```
boxShadow: 0 0 0 ${6 + level*0.25}px rgba(59,165,92, ${0.7 + level*0.003}),
           0 0 ${16 + level*0.6}px rgba(59,165,92, ${0.4 + level*0.006})
```
Apply to both caller and recipient avatar `boxShadow` in `VoiceCallOverlay.tsx`.

---

## 3. Deafen indicator in call overlay + priority over mute

**Current bug**: Line 140-144 in VoiceCallOverlay only renders a muted badge. No deafen badge exists.

**Fix**:
- Add deafen badge rendering (headphone-deafen icon in red circle)
- Show deafen badge when `isDeafened` is true, regardless of `isMuted`
- Only show mute badge when `isMuted && !isDeafened` (deafen takes priority)
- In `toggleDeafen` (VoiceContext line 755): when deafening, also mute the mic (`localStream` audio tracks `enabled = false`); when undeafening, restore mic to previous mute state (need to track pre-deafen mute state)

---

## 4. Custom branded dropdowns (Register DOB + Voice device selectors)

**Approach**: Replace all native `<select>` elements with the existing Radix `Select` component from `src/components/ui/select.tsx`, styled to match the app's dark theme.

**Files to change**:
- `src/pages/Register.tsx`: Replace 3 native `<select>` elements (month, day, year) with themed `Select/SelectTrigger/SelectContent/SelectItem`
- `src/components/app/settings/VoiceVideoSettings.tsx`: Replace 3 native `<select>` elements (server region, input device, output device) with themed Select components
- Style the Select components with app theme CSS variables for backgrounds, borders, and text colors

---

## 5. Custom Windows desktop titlebar

**Current**: `electron/main.cjs` uses default OS frame (`frame` defaults to `true`).

**Fix**:
- Set `frame: false` and `titleBarStyle: 'hidden'` in `BrowserWindow` options
- Add a `TitleBar.tsx` React component rendered at the top of `AppLayout.tsx` (only when running in Electron, detected via `navigator.userAgent` or a global flag)
- The titlebar includes: app icon, "Cubbly" text, drag region (`-webkit-app-region: drag`), and minimize/maximize/close buttons (`-webkit-app-region: no-drag`)
- Style using `--app-*` CSS variables so it adapts to all themes (default, onyx, white, cubbly)
- Add `preload.cjs` script to expose `window.electronAPI` with `minimize()`, `maximize()`, `close()` via `ipcRenderer`
- Add IPC handlers in `main.cjs` for these window control actions

---

## 6. Fix screen sharing in desktop Electron app

**Root cause**: Electron doesn't support `navigator.mediaDevices.getDisplayMedia()` by default the same way browsers do. In Electron, you need to use `desktopCapturer` API to enumerate sources, then pass the selected source ID as a `chromeMediaSourceId` constraint.

**Fix**:
- In `electron/main.cjs`: Add `webPreferences.contextIsolation: true` with a preload script
- Create `electron/preload.cjs`: Expose `desktopCapturer.getSources()` via `contextBridge`
- In `VoiceContext.tsx` `startScreenShare`: Detect Electron environment; if in Electron, call `window.electronAPI.getDesktopSources()` to get available screens/windows, then use `getUserMedia` with `chromeMediaSourceId` constraint instead of `getDisplayMedia`
- The existing `ScreenSharePicker.tsx` UI already lets the user pick screen/window/tab — wire it to actually enumerate Electron sources and show them
- Include `audio: true` via `chromeMediaSourceId` for system audio capture

---

## 7. Files to modify

| File | Changes |
|------|---------|
| `src/contexts/VoiceContext.tsx` | applyConstraints on settings change, sensitivity gating, deafen=mute+deafen logic, Electron screen share path |
| `src/components/app/settings/VoiceVideoSettings.tsx` | Fix mic test constraints, replace native selects with Radix Select |
| `src/components/app/VoiceCallOverlay.tsx` | Stronger speaking ring, deafen badge with priority over mute |
| `src/pages/Register.tsx` | Replace native selects with Radix Select |
| `electron/main.cjs` | frame:false, preload script, IPC handlers, desktopCapturer setup |
| `electron/preload.cjs` | New file — contextBridge for window controls + desktopCapturer |
| `src/components/app/TitleBar.tsx` | New file — custom Windows titlebar component |
| `src/pages/AppLayout.tsx` | Render TitleBar when in Electron |
| `src/components/app/ScreenSharePicker.tsx` | Support Electron source enumeration |

