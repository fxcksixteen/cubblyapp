## v0.3.1 hotfix plan

Five distinct bugs, all addressed below.

---

### 1. Badge 3D artwork missing in the Shop

**Cause:** `ShopView.ItemPreview` for `category === "badge"` renders a generic colored chip with a `★`. The actual artwork map (`BADGE_ART`) lives in `src/components/app/UserBadges.tsx` and is only used in profile rows.

**Fix:**
- Extract `BADGE_ART` + `<Badge />` into a shared module (`src/components/app/badgeArt.ts` re-exporting from `UserBadges.tsx`, or just import the map directly from `UserBadges.tsx`).
- In `ShopView.ItemPreview` badge branch, render the matching SVG/PNG (e.g. `imgChatChampion`, `imgPetite`, etc.) at ~64px next to the user's display name instead of the chip+star.
- Also update `src/components/app/settings/ShopItemsGrid.tsx` (badge previews) the same way so My Account → Badges shows the real artwork.

---

### 2. Mute & deafen still kills the call

**Cause:** `applyLocalMicMute` in `VoiceContext.tsx` always calls `sender.replaceTrack(null)` then `replaceTrack(originalMicTrackRef.current)`. On undeafen the original track is sometimes ended/stale (e.g. after device-change or an iOS background trip), so `replaceTrack` succeeds locally but the peer never receives audio again — the call is "broken" until reconnect.

**Fix:**
- Default mute path = `track.enabled = false/true` only (lightweight, never breaks the SRTP stream).
- Keep the `replaceTrack(null)` belt-and-suspenders behavior **only on iOS PWA** (where the original leak occurred), gated by a `isIOSPWA()` check that already exists in `iosAudioUnlock.ts`.
- On undeafen, if `originalMicTrackRef.current.readyState === "ended"`, reacquire a fresh mic stream via `getUserMedia` and `replaceTrack` with the new track before broadcasting `peer-mute: false`.
- Add a guard so deafen always restores the prior mute state regardless of whether the deafen→mute path actually swapped the track.

---

### 3. Existing themes (Cubbly, Onyx, etc.) no longer apply

**Cause:** `EquippedThemeBridge` runs on every login. When the user has **no shop-theme equipped** (the 4 built-in themes are local-only, never written to `user_equipped`), it falls through to `setTheme("default")`, which overwrites the locally saved "cubbly" preference.

**Fix:**
- In `EquippedThemeBridge`, only call `setTheme(THEME_MAP[id])` when there *is* an equipped row.
- When no equipped theme row exists, **do nothing** — let the user's localStorage choice (loaded by `ThemeContext`) stay in effect.
- When the user explicitly *unequips* a shop theme via realtime DELETE, fall back to whatever is in localStorage (re-read it), not hard-coded "default".

---

### 4. Settings tabs — double titles, inconsistent buttons, ugly cards

**Causes:**
- `SettingsModal` already renders a header row (`User Settings` eyebrow + `<h1>{activeLabel}</h1>`).
- Each tab component (`DataPrivacySettings`, `AccessibilitySettings`, `ContentSocialSettings`, `DevicesSettings`, etc.) *also* renders its own `<h2>{title}</h2>` + description block → the "two titles" the user is seeing.
- The `Switch` in `DataPrivacySettings` uses shadcn's default `bg-primary`, which is the global orange `--primary` token — that's why the toggles look "Cubbly orange" even on the default theme. The custom toggle in `AccessibilitySettings`/`ContentSocialSettings` uses `#3ba55c` (green) — different color, different shape → inconsistent.

**Fix:**
- Remove the inner `<h2>` + description block from every settings sub-component (`DataPrivacySettings`, `AccessibilitySettings`, `ContentSocialSettings`, `DevicesSettings`, `ChatSettings`, `LanguageTimeSettings`, `KeybindsSettings`, `AdvancedSettings`, `NotificationSettings`, `ActivityPrivacySettings`, `GamingModeSettings`, `UpdateLogsSettings`).
- Move the per-tab description into the `SettingsModal` header itself (under the `<h1>`), driven by a `descriptions` map keyed by `SettingsCategory` so the header shows: eyebrow → title → optional one-line description. Single source of truth, no duplication.
- Replace shadcn `Switch` usage in `DataPrivacySettings` with the same custom toggle used by `AccessibilitySettings` / `ContentSocialSettings`. Lift it into `src/components/app/settings/SettingsToggle.tsx` and import everywhere so all toggles look identical (green when on, neutral when off).
- Standardise primary action buttons across all settings tabs to the Discord blurple (`#5865f2`) — no more orange leakage.
- Standardise card padding/radius (`rounded-[24px] border p-5`) and section eyebrows (`text-[11px] uppercase tracking-[0.18em]`) by introducing a tiny `SettingsCard` + `SettingsSectionLabel` helper in `src/components/app/settings/_shared.tsx`.

---

### 5. Devices tab — wrong purpose & wrong location

The current "Devices" tab lists local mics/speakers/cameras. The user wants it to be a **security panel** showing currently signed-in sessions with the option to revoke them — and moved under **User Settings**.

**Plan:**
- Rename current local-hardware listing → fold the mic/speaker/camera enumeration into the existing **Voice & Video** tab as a "Detected hardware" subsection (it already covers input/output device choice).
- Replace the "Devices" tab content with a real **Active Sessions** panel:
  - New table `public.user_sessions(id uuid PK, user_id uuid, device_label text, user_agent text, platform text, ip_inet inet, last_seen_at timestamptz, created_at timestamptz, current_session_id text)` with RLS allowing a user to `select`/`delete` only their own rows.
  - On every successful auth state change in `AuthContext`, upsert a row keyed by a stable `session_id` stored in `localStorage` (`cubbly:session-id`, generated once per install), updating `last_seen_at` and `device_label` (e.g. `Cubbly Desktop · Windows 11`, `Chrome on macOS`, `iPhone PWA`).
  - On `signOut`, delete the row for the current `session_id`.
  - New `DevicesSettings` UI: lists rows ordered by `last_seen_at DESC`, with the current device pinned at top and badged "This device". Each other row has a **Sign out** button that deletes the row (the next time that client polls/refreshes it gets a 401 from `auth.refreshSession`, which we already handle by routing to `/login`). Add a **"Sign out everywhere else"** button.
- Move `Devices` from the **App Settings** section to the **User Settings** section in `settingsSections` inside `SettingsModal`, right after `Notifications`.

---

### Technical notes

- New file: `src/components/app/settings/_shared.tsx` (SettingsCard, SettingsSectionLabel, SettingsToggle).
- Migration: `create table public.user_sessions ...` + RLS + index on `(user_id, last_seen_at desc)`.
- `EquippedThemeBridge` change is a 4-line tweak; `ThemeContext` exposes a small `getSavedTheme()` helper.
- Voice fix needs a feature-detect helper for ended tracks + a tiny `acquireFreshMic()` utility added next to `applyLocalMicMute`.
- `BADGE_ART` map will be moved/exported from `UserBadges.tsx` so `ShopView` and `ShopItemsGrid` can import it without duplication.

After these changes I'll bump the changelog with v0.3.1 entries covering the badge artwork, mute/deafen stability fix, theme persistence fix, settings UI overhaul, and the new sessions panel.