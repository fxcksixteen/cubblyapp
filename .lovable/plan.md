## v0.3.0 inspection — what's fine, what's missing

I went through every piece you shipped for v0.3.0 (coins, shop, name colors, themes incl. Space, 3D badges, notes vault, settings expansion, sounds, status/voice/rejoin fixes, locked-shop grid). Most of it is wired correctly. Below are the real gaps I want to fix before calling v0.3.0 done — then I'll do a focused iOS-PWA pass.

---

## Part 1 — v0.3.0 functionality fixes

### A. Personal Notes (highest-priority, you called these out)

1. **Wire the 7 new sounds you just dropped into `/public/sounds/`.** Right now `src/lib/sounds.ts` only knows about `message`, `outgoingRing`, `incomingCall`, `leaveCall`, `coinsReceive`, `coinsSpend`. The new files exist on disk but nothing plays them. I'll:
   - Add `mute`, `unmute`, `deafen`, `undeafen`, `joinCall`, `screenshareStart`, `screenshareStop` to `SoundKey` + `SOUND_PATHS`.
   - Trigger them at the right call sites in `VoiceContext.tsx` and `GroupCallContext.tsx` (toggleMute, toggleDeafen, on connect, on screenshare start/stop). The existing `leaveCall` stays where it is.
   - Respect DND + gaming suppression like the others.

2. **Notes editor bugs found while reading the code:**
   - The "is this note dirty" check uses a `useRef`, but the autosave `useEffect` returns early when `dirty.current === false` — it still runs on every keystroke and starts a 700ms timer that immediately gets cleared next keystroke. That's fine, but `dirty.current` is never reset to `true` from the contentEditable `onInput` reliably (it is, but only inside `setBody`). I'll make the dirty flag deterministic and add a `beforeunload` flush so a fast tab close doesn't lose the last 700ms of typing.
   - Switching between notes calls `useEffect([note.id])` to load HTML into the contentEditable — but it does NOT reset local `title`/`body`/`attachments` state, so opening note B briefly shows note A's title until rerender. Fix: reset all three states on note id change.
   - `confirm("Delete this note?")` is blocked by Safari in standalone PWA mode and looks bad on iOS. Replace with a small custom AlertDialog.
   - Lock button only locks until refresh — there's no actual "this device" toggle visible after setup. I'll add a "Forget this device" button inside the editor footer (calls existing `forgetDevice()`).
   - `byte_size` is set on insert but not on update — fix so the column stays accurate.

3. **Notes mobile/PWA layout:** The two-pane layout (`w-72` list + editor) doesn't collapse on mobile; on iPhone widths the editor becomes ~30px wide. I'll switch to a stacked layout at `< md`: list view → tap note → full-screen editor with back arrow.

4. **Notes attachment download in iOS PWA:** `a.download` is ignored in standalone iOS. I'll fall back to opening the decrypted blob in a new tab when standalone iOS is detected, so files actually become accessible.

5. **Notes sidebar entry on mobile:** `MobileBottomNav` has Home/Friends/Shop/You — no Notes entry. I'll either replace "You" placement with Notes or add a Notes shortcut at the top of the mobile DM panel (cleaner). Going with the second option to keep the bottom nav stable.

### B. Other v0.3.0 polish

6. **Bump `CURRENT_VERSION` to `0.3.0`** in `src/lib/changelog.ts` and `package.json`, and prepend a v0.3.0 entry to `CHANGELOG` summarizing: shop + economy, encrypted notes, themes (incl. Space), 3D badges, expanded settings, new sound effects, status/mute/rejoin fixes. (Per your earlier rule: don't overcrowd with shop economics; just mention the shop is live and point to the in-shop "How coins work" modal.)

7. **`ShopItemsGrid` realtime channel name collision** — the channel id is `settings-shop:${category}:${user.id}`. If both a Name Colors AND Badges section render in My Account, that's two different channels (different category) so it's fine. Verified, no fix needed. Noted for myself.

8. **Locked-shop grid: clicking a locked theme should open the shop on the THEMES tab.** Right now it just does `navigate("/@me/shop")` and lands on whatever the last open tab was. Same for name colors and badges. I'll pass a hash like `/@me/shop#tab=theme` and have ShopView read it.

9. **`equip_shop_item` for badges silently fails when 3 are already equipped** — the `gaps` CTE returns no rows, so `_next_slot = 0` and the insert collides with an existing slot-0 badge unique constraint (or just overwrites). I'll either add a clear error toast ("Unequip a badge first — max 3 equipped") in the client, or change the RPC to swap out the oldest. Going with the client-side guard; safer.

### C. Verified working (no changes needed)

- Coins backbone, message/voice/gaming accrual, reward toast + sound, balance pill.
- Shop catalog + purchase flow + "not enough coins" modal + banners.
- Themes (Space + Ocean/Blossom/Evergreen/Synthwave/Lava/Borealis) + EquippedThemeBridge.
- Name colors (static / gradient / animated) rendering globally via UserDisplayName.
- 3D badges across DM list, profile popups, members panel, friends list.
- Status presence (per-connection key fix), deafen via gain pipeline, rejoin auto-accept branch.
- Settings expansion: Devices, Data & Privacy, Chat, Language & Time, Content & Social, Accessibility, Keybinds, Update Logs.

---

## Part 2 — iOS PWA hardening pass

10. **Manifest icons are wrong.** `manifest.webmanifest` only has `favicon.ico` (32×32 ICO) listed as the only icon, marked `"any maskable"`. iOS will show a low-res blurry icon when added to home screen, and Android requires a proper maskable PNG to avoid the white-square fallback. I'll:
    - Generate proper PNG icons at 192×192, 512×512, and 180×180 (Apple touch) from the existing favicon/source art.
    - Add them to `/public/icons/`.
    - Update the manifest with separate `"any"` and `"maskable"` icon entries.
    - Add `<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">` in `index.html` (currently points to `/favicon.ico`).
    - Add `<link rel="apple-touch-startup-image">` for the splash so iPhones don't show a blank white card while booting.

11. **iOS PWA viewport / safe areas.** Spot-check confirmed `safe-area-inset-top/bottom` is honored in `AppLayout` and `MobileBottomNav`, but the Notes screen uses `flex-1 p-8` with no safe-area handling — on a notched iPhone the lock-screen icon clips into the status bar. I'll add `padding-top: env(safe-area-inset-top)` to the Notes lock screen and editor header.

12. **Notes contentEditable on iOS Safari:** iOS aggressively shows the "AutoFill / Suggestions" bar over the contentEditable, and `document.execCommand("bold"/"italic"/"underline")` is partially deprecated. The current toolbar still works on iOS 17/18 but is brittle. Short-term: add `autocapitalize="sentences"`, `autocorrect="on"`, `spellcheck` and `inputmode="text"` to the contentEditable, and switch text formatting to wrap selected ranges with the proper inline styles using `document.execCommand` with a fallback to manual `Range` wrapping when execCommand reports false. Long-term replacement (Tiptap/ProseMirror) is out of scope for v0.3.0.

13. **Sound playback on iOS PWA.** `iosAudioUnlock.ts` already exists. I'll verify it's primed for ALL the new sounds (mute/unmute/deafen/etc.) by extending the unlock list, otherwise the first mute/deafen tap on iPhone is silent.

14. **Service worker:** `src/sw.ts` is push-only — fine. But the manifest `start_url: "/"` means a freshly installed iPhone PWA opens at `/` and does a client-side redirect to `/@me/online`, which adds a flash. I'll change `start_url` to `/@me/online` (still safe — auth gate redirects to `/login` if no session). Note: per the docs, installed PWAs cache `start_url` at install time, so this only helps fresh installs.

15. **PWA install affordance:** Already handled via `MobileNotificationPrompt`. No change needed.

16. **Verify chat input + emoji picker keyboard behavior on iOS.** Already known-good per recent patches; no scoped change unless I spot a regression while testing.

---

## Files I expect to touch

```text
src/lib/sounds.ts                              (add 7 new sound keys)
src/contexts/VoiceContext.tsx                  (trigger new sounds at toggles + connect)
src/contexts/GroupCallContext.tsx              (same)
src/lib/iosAudioUnlock.ts                      (extend unlock list)
src/components/app/NotesView.tsx               (mobile layout, dirty flag, dialog, attachments fallback, safe areas)
src/contexts/NotesContext.tsx                  (byte_size on update, beforeunload flush helper)
src/components/app/settings/ShopItemsGrid.tsx  (deep-link to shop tab)
src/components/app/ShopView.tsx                (read tab hash, handle 3-badge cap toast)
src/components/app/DMSidebar.tsx               (mobile Notes shortcut at top of mobile panel)
src/lib/changelog.ts                           (CURRENT_VERSION = "0.3.0" + new entry)
package.json                                   (version bump)
public/manifest.webmanifest                    (proper icons, start_url)
public/icons/*.png                             (generate 192/512/180)
index.html                                     (apple-touch-icon link, startup image)
```

No database migrations needed for any of this.

---

## Order of operations

```text
1. Notes fixes (most-requested)
2. New sound effects wired to call/screenshare events
3. Locked-shop deep-link + 3-badge cap toast
4. Version bump + changelog entry
5. iOS PWA: manifest icons, apple-touch-icon, start_url, safe areas on Notes
6. Final smoke pass + summary
```

Approve and I'll execute the whole thing in one focused pass.
