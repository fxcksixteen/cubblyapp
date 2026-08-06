# v0.4.31 — Honey billing, icons, notes attachments, profile tabs

## 1. Honey subscription shows a past renewal date

Confirmed in the database: all three complimentary Honey rows (kaszy, fawnsly, geassbound) still have `current_period_end = 2026-08-01`, i.e. already in the past. The `roll_complimentary_subscription()` function does roll the date forward, but it only runs when the gems context happens to fire, and it rolls to `date_trunc('month', now()) + 1 month` only after the period has lapsed — so the UI shows a stale date until something triggers it.

Fix:
- Roll the complimentary period on read as well: call the roll RPC when Billing settings mounts (not just from the gems flow), then re-read the row.
- Harden the rolling logic so it always lands on the next month boundary in the future (loop/`generate_series`-style clamp instead of a single step), and immediately advance the three existing rows so they read as August.
- Copy: for complimentary plans show "Renews <date>" based on the rolled value.

## 2. "Monthly gems —" in Billing

Billing reads `ent.monthlyGems`, which comes from `honey_entitlements`. That function returns 500 only for tier `honey`. Since these accounts are tier `honey`, the dash means the entitlements row hadn't loaded (or tier resolved to free because the period end was in the past — same root cause as #1). After the period fix, verify the perk row shows `+500`, and render a skeleton instead of `—` while entitlements are still loading.

## 3. Activity icons sitting in a square

`ActivityIcon` paints a translucent background behind the `<img>` and rounds it. Remove the background plate and the rounding on real artwork so only the icon itself shows (letter-tile fallback keeps its colored tile). Same treatment anywhere the icon is wrapped in a plate (sidebar activity card, activity card, profile activity).

## 4. Notes attachments come back as unopenable files

The underlying objects are fine — storage still has every file with `iv`, `mime` and the original filename in its metadata. The likely cause is the recovery/hydration path producing attachment entries with an empty `iv`, which makes the download fall back to "serve raw bytes", i.e. the still-encrypted blob (that is exactly the "weird file" you get). This is unconfirmed, so step one is to verify it before changing behaviour:

- Instrument/inspect the note's stored attachment list vs storage metadata for the affected note and confirm whether `iv`/`mime` were blanked.
- Then: when an attachment entry has no `iv` (or a generic mime), re-read the object's storage metadata and use the `iv`/`mime`/`originalName` from there before downloading; only fall back to raw bytes when storage truly has no `iv`.
- Repair the note's saved attachment list once resolved, so the fix sticks.
- Inline images that show as broken/"expired": re-hydrate from the attachment id instead of the stale `blob:` URL.

## 5. Honey-only nudge shown to Honey subscribers

In the note share sheet the upgrade banner is driven by `honeyLocked = !ent.canShareNoteAdvanced`, which is briefly true before entitlements load. Gate the banner on `ent.loaded && !ent.canShareNoteAdvanced` so subscribers never see it (and locks aren't applied during the load window).

## 6. No lazy/pop-in loading for any icon

- Remove `loading="lazy"` from icon-ish images and never add it to icons (GIF grid and chat attachments keep it — those are content, not icons).
- Add `decoding="sync"` + `fetchpriority="high"` to icon images (settings glyphs, gem/coin pills, honey jar, gift svg, badges).
- Preload the icon set at app boot: a small module that imports every icon/3D asset and warms them via `new Image()` (and `<link rel="preload">` for the handful used on first paint), so they are in cache before any panel opens.

## 7. Honey annual copy

On `/honey`, when the annual interval is selected, the Honey perk reads "6,000 gems up front" instead of "500 gems every month". Monthly keeps the existing wording.

## 8. DM sidebar: rotate custom status and activity

Today activity always wins over custom status. When a user has both, the subtitle line cycles between them every 3 seconds with a clean vertical slide (up/out, up/in), respecting `prefers-reduced-motion`. Only one line is rendered at a time so row height never changes.

## 9. Mutual Friends and Mutual Servers tabs in the profile card

Add two tabs to the user profile card (alongside the existing content), Discord-style:
- Mutual Friends: shared friends with avatar, display name, badges; clicking opens that user's profile.
- Mutual Servers: shared servers with icon and name; clicking jumps to the server.
- Tab switching slides horizontally (left/right depending on direction) with a smooth transition; empty states for "No mutual friends / servers".

Data comes from the existing friendship and server-membership tables, scoped to the viewer and the profile owner.

## Technical notes

- Files: `src/components/app/settings/BillingSettings.tsx`, `src/hooks/useEntitlements.ts`, `src/components/app/ActivityIcon.tsx`, `src/components/app/ActivityCard.tsx`, `src/contexts/NotesContext.tsx`, `src/components/app/NotesView.tsx`, `src/pages/HoneyPage.tsx`, `src/components/app/DMSidebar.tsx`, `src/components/app/chat/UserProfileCard.tsx`, plus a new icon-preload module.
- Backend: one migration hardening `roll_complimentary_subscription()`, plus a data update advancing the three stale complimentary rows.
- Mutual lists use security-definer helpers already present (`share_mutual_friend`, `share_mutual_server`) or dedicated read queries scoped by RLS.
- No version bump or changelog entry unless you ask for one.
