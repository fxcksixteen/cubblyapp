## Plan — Two deliverables

### 1) Re-package the iOS Build 11 zip
The previous run never produced `cubbly-ios-v0.1.4-build11.zip` in `/mnt/documents/`. Re-zip the current `ios-native/` source tree (which already contains all build-11 fixes — RealtimeChannelFactory, presence/reactions/calls refactor, `CFBundleVersion = 11`) and emit it as a `presentation-artifact`.

---

### 2) Web + Desktop hotfix → bump to **v0.2.29**

#### A. Screen-share volume persists across fullscreen exit
File: `src/components/app/FullscreenScreenShareViewer.tsx`
- The unmount cleanup currently force-resets the shared `<audio>` element to `muted = false; volume = 1`. That is why dragging the slider in fullscreen takes effect, but the moment you exit fullscreen the audio snaps back to 100%.
- Change the unmount path to **apply the user's last persisted stream volume** (already saved per-stream in `localStorage`) to the shared `<audio>` element instead of hard-resetting to `1`. For volumes > 100%, persist the boost setting and re-apply it via a long-lived WebAudio gain node owned by `VoiceContext` (so it survives unmount), or cap to 1.0 on the element when leaving fullscreen but remember the >100% intent for the next fullscreen open.
- Also re-apply the saved volume in `VoiceContext` / `GroupCallContext` `ontrack` for screen audio so a stream that arrives while NOT in fullscreen also respects the last-set volume.

#### B. Speaking-ring smoothness/sensitivity regression
Files: `src/contexts/VoiceContext.tsx`, `src/contexts/GroupCallContext.tsx`, `src/components/app/VoiceCallOverlay.tsx`, `src/components/app/GroupCallPanel.tsx`
- The recent `Math.abs(next - last) > 1` re-render gate (added in 0.2.28) is too coarse — it kills small-but-meaningful updates, making the green ring feel "sticky" instead of reactive. Lower the gate to `0.3` (or remove for the local meter and keep `0.5` for remote).
- Lower analyser `smoothingTimeConstant` from `0.5` → `0.35` and `fftSize` stays `256`, so the meter follows transients again.
- Lower `SPEAKING_THRESHOLD` from `10` → `6` in both `VoiceCallOverlay.tsx` and `GroupCallPanel.tsx` so the ring lights up at normal speaking volume the way it used to.
- Tighten the box-shadow CSS transition from `80ms linear` → `60ms linear` so the ring tracks the meter visually.

#### C. "Rejoin" creates a new call instead of joining the live one + peer still shown as in-call
Files: `src/contexts/VoiceContext.tsx`, `src/components/app/ChatView.tsx`
Root causes:
1. After a hangup, the leaver's `endCall` issues an **async** `UPDATE … left_at = …` followed by a `SELECT count`. If the count read replica is behind, it can momentarily return 0 → the whole `call_event` gets flipped to `ended`, even though the peer is still in. On rejoin, `startCall`'s "find existing ongoing event" lookup then misses → it creates a brand-new event.
2. The peer's UI in-call indicator (avatar badge) reads `call_participants` once and isn't subscribed to live changes, so the leaver looks "still in call" even after `left_at` updates.

Fixes:
- In `endCall`, only mark the **event** as ended when (a) our update succeeded **and** (b) there are zero rows with `left_at IS NULL` **and** zero rows with a `last_seen_at` within the last 15s. Use the existing `end_call_event_if_stale` RPC instead of a raw `UPDATE` so the server is the single source of truth.
- In `startCall`'s existing-event lookup, also accept events whose state was flipped to `ended` within the last 30s **if** another participant still has `left_at IS NULL` and a fresh `last_seen_at` — re-open the event in that case (RPC: a small new `reopen_call_event_if_live`, or just clear `state` back to `ongoing` via RLS-safe update by the still-live participant; simpler path: prefer reusing **any** event with a fresh live peer, regardless of state).
- On the receiver, when `peer-leave` is handled, fire one immediate `heartbeat_call_participant` so our own `last_seen_at` is fresh and the leaver's rejoin logic picks us up instantly.
- In `SidebarVoiceCard` / `GlobalCallIndicator` (whichever paints the "in call" avatar overlay), subscribe to `postgres_changes` on `call_participants` filtered to the watched user, so the indicator drops to "Not In Call" the instant `left_at` is written.

#### D. Update log + version bump
- `src/lib/changelog.ts`: bump `CURRENT_VERSION` to `"0.2.29"` and prepend a new entry titled "Calls polish: fullscreen volume, smoother speaking rings, reliable rejoin".
- `package.json` + `package-lock.json`: bump `version` to `0.2.29`.

#### Out of scope
- iOS native app (already on build 11; no changes).
- Mobile web overlay speaking ring uses the same constants — it gets the fix for free.

#### Deliverables to user
- `presentation-artifact` for `cubbly-ios-v0.1.4-build11.zip`
- Code changes above (Lovable auto-deploys preview/published web app)
- Note that the user still needs to run the desktop electron build pipeline locally after `git pull` — same flow as 0.2.28.
