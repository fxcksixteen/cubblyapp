/**
 * Single source of truth for ALL Cubbly version changelogs.
 *
 * To ship a new patch:
 *   1. Add a new entry at the TOP of `CHANGELOG`.
 *   2. Bump CURRENT_VERSION to match.
 *   3. (optional) Update the hero image per release.
 *
 * `WhatsNewModal` reads CURRENT_VERSION on mount and shows once per user.
 * `UpdateLogsSettings` reads the full list so users can revisit any past patch.
 */
import bearImage from "@/assets/whats-new-bear.png";

export interface ChangelogEntry {
  version: string;
  /** Optional friendly subtitle / release name. */
  title?: string;
  /** ISO date string (e.g. "2026-04-16"). */
  date: string;
  /** Hero image shown in the rectangular frame at the top of the modal. */
  hero: string;
  newFeatures: string[];
  bugFixes: string[];
}

export const CURRENT_VERSION = "0.2.3";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.3",
    title: "Updater hotfix + notification settings",
    date: "2026-04-17",
    hero: bearImage,
    newFeatures: [
      "Added a Check for Updates button in Update Logs so desktop users can force a GitHub update check instantly",
      "Filled out the Notifications settings tab with desktop alerts, message sound, preview toggles, plus test buttons",
      "Update checks now surface real status toasts so you can see checking, downloading, latest-version, and error states",
    ],
    bugFixes: [
      "Fixed the settings footer version so it now follows the real current release",
      "Fixed the updater flow by shipping the app itself as v0.2.3 instead of still reporting v0.2.1",
      "Fixed the Update Logs ref warning in SettingsModal by forwarding the settings panel ref correctly",
    ],
  },
  {
    version: "0.2.2",
    title: "Desktop notifications, fixed",
    date: "2026-04-17",
    hero: bearImage,
    newFeatures: [
      "Desktop notifications now ship enabled out of the box — no permission prompt, no setup, just install and go",
      "Toasts now show the sender's profile picture instead of the Cubbly logo (Discord-style)",
      "Notifications are properly attributed to 'Cubbly' on Windows instead of 'Electron'",
    ],
    bugFixes: [
      "Fixed message notification sound not playing — message.wav now plays reliably on every new DM",
      "Fixed the OS playing its generic 'ding' on top of our custom sound (double-ding gone)",
      "Web version no longer prompts for browser notification permission — only the desktop app and installed mobile PWA ask",
    ],
  },
  {
    version: "0.2.1",
    title: "Group voice + video + screen share",
    date: "2026-04-17",
    hero: bearImage,
    newFeatures: [
      "Group voice calls — start a call in any group DM and ring every member at once with a full N-peer audio mesh",
      "Group video calls — toggle your camera mid-call and see every member's video tile in a live grid",
      "Group screen sharing — share your screen to the whole group, with a big-format viewer for whoever's presenting",
      "iOS & Android push notifications — Cubbly is now a full PWA, add it to your home screen and get real OS notifications even when the app is closed",
      "Activity icons everywhere — game/app logos now show in the DM sidebar, profile popups, full profiles and the Active Now rail",
      "Smart icon resolution — curated logos for popular games/apps, Steam CDN fallback, then the actual .exe icon from your OS",
      "Discord-style activity card in the DM sidebar with the icon, name, verb (Playing/Using) and live elapsed time",
      "Live voice status card in the DM sidebar with WiFi-bar ping indicator (hover for ms), location, and quick mute/cam/share/hangup buttons",
      "Per-peer speaking rings in group calls so you can see exactly who's talking",
      "'Using Steam' (and other software) now correctly says Using instead of Playing",
    ],
    bugFixes: [
      "Fixed activity card not appearing for some users with Steam open",
      "Fixed Steam, Discord and other software still showing as 'Playing' instead of 'Using' in some places",
      "Fixed missing voice/video buttons in the group chat header",
      "Smoother fallback when no curated icon exists — colored letter tiles instead of broken images",
      "Per-peer audio level monitoring no longer leaks AudioContext on call end",
      "Group call participants list now refreshes correctly when someone joins or leaves mid-call",
      "Web app no longer crashes after a hard refresh on the chat view",
      "Mobile notification prompt now actually wires up to Web Push instead of only browser-tab notifications",
    ],
  },
  {
    version: "0.2.0",
    title: "Gaming Mode, video calls & mobile rework",
    date: "2026-04-16",
    hero: bearImage,
    newFeatures: [
      "Gaming Mode — Cubbly now auto-suppresses itself when you're in-game so it never interferes with your performance",
      "Auto-updater — desktop app now updates itself in the background",
      "Activity status — Cubbly auto-detects games you're playing (or add your own .exe)",
      "Video calling — toggle your webcam mid-call with picture-in-picture tiles",
      "Voice & Video settings — camera picker, resolution, FPS, mirror toggle, live test",
      "Full mobile rework — swipe gestures, bottom nav, and fullscreen call screen",
      "Auto-launch on startup — Cubbly opens automatically when you sign in to your PC",
      "Type-to-focus — start typing anywhere and it lands in the message box",
      "Global in-call indicator — see your active call no matter where you are in the app",
      "Friends tab badge — pending requests now show a red dot on the Friends tab too",
      "Update Logs settings tab — revisit any past patch's changelog whenever you want",
    ],
    bugFixes: [
      "Fixed camera test preview staying black after clicking Test Camera",
      "Fixed right-click → View Profile in DM list opening the chat instead of the profile",
      "Fixed Voice & Video settings crashing on machines with default-only camera entries",
      "Active Now sidebar now actually lists friends with live activities",
      "Smoother in/out animations on the What's New modal",
      "Various performance improvements and small visual polish across the app",
    ],
  },
];

export const getChangelogEntry = (version: string): ChangelogEntry | undefined =>
  CHANGELOG.find((e) => e.version === version);
