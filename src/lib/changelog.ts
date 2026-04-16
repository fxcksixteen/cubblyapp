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

export const CURRENT_VERSION = "0.2.0";

export const CHANGELOG: ChangelogEntry[] = [
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
