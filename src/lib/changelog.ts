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

export const CURRENT_VERSION = "0.2.25";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.25",
    title: "Status, unread bars & screenshare controls fixed",
    date: "2026-04-24",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Friend status indicators (online / idle / DND / invisible) now reliably show up across web and desktop — no more 'everyone looks offline' moments.",
      "The blue 'New Messages' bar and red 'NEW' divider now stick around when you open a chat instead of vanishing instantly. They clear once you scroll to the bottom, hit Mark as Read, or send a reply.",
      "The fullscreen screen-share controls (volume slider, fullscreen exit, etc.) are now anchored INSIDE the stream frame instead of floating in the corners of your screen — they're actually clickable now even when the stream is letterboxed.",
      "Right-clicking a friend's screen-share now opens stream-only controls (volume + mute that stream for you), separate from their voice. The fullscreen volume slider also now controls the stream itself, not their mic.",
      "When viewing the 'Update Logs' from Settings, clicking a past patch now opens the full update log popup properly instead of being clipped at the top and bottom by the settings window.",
      "iOS PWA: another round of fixes for Voice & Video settings crashing the app, and for incoming calls being completely silent.",
    ],
  },
  {
    version: "0.2.24",
    title: "No more ghost login tab + status indicators back",
    date: "2026-04-23",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed Cubbly opening TWO windows on startup (one logged in, one stuck on the login screen). Only one Cubbly window can run at a time now — relaunching just focuses the existing one, Discord-style.",
      "Fixed friend status indicators (online / idle / DND / invisible) sometimes never appearing until someone toggled their status.",
      "Fixed the iOS PWA hard-crashing the whole app the moment you opened Voice & Video settings.",
      "Fixed iOS PWA users hearing complete silence on incoming calls (no voice, no screen-share audio, nothing). Call audio now comes alive the moment they touch the screen.",
    ],
  },
  {
    version: "0.2.23",
    title: "Smoother screenshare + iOS settings stability",
    date: "2026-04-22",
    hero: bearImage,
    newFeatures: [
      "Right-click directly on a friend's screen-share in fullscreen to open the same volume menu (0–200%, mute-for-you, reset) you get from their avatar.",
      "When you're streaming and switch to your game, Cubbly now automatically pauses YOUR local preview to free up GPU/CPU. Your viewers still see the stream perfectly — only your own preview is paused. Focus Cubbly again to resume.",
    ],
    bugFixes: [
      "Fixed the fullscreen screen-share volume slider kicking you out of fullscreen on drag — slider events now stay where they belong.",
      "Fixed the iOS PWA hard-crashing to the snag screen when opening Voice & Video settings.",
      "Reduced ping spikes during a game screen-share by backing off the activity-poller while sharing — no impact on per-window audio capture.",
    ],
  },
  {
    version: "0.2.22",
    title: "Calls connect reliably + iOS splash restored",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed an error screen that could pop up the moment a second person joined a call, blocking the call from connecting.",
      "iOS PWA splash now plays the same animated bears intro as the desktop app instead of a static fallback.",
    ],
  },
  {
    version: "0.2.21",
    title: "Window screenshare audio fix",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Sharing a single window on Windows now reliably captures that app's audio on machines where it was silently failing before.",
    ],
  },
  {
    version: "0.2.20",
    title: "More screenshare audio compatibility",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Window screen-share audio now works on a wider range of Windows audio setups that previously refused to capture.",
      "Fixed a rare error screen that could appear right after switching chats or reconnecting.",
    ],
  },
  {
    version: "0.2.19",
    title: "Better diagnostics for screenshare audio issues",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "When window screen-share audio fails on Windows, the app now collects much more detail to help us pinpoint and fix the cause faster.",
    ],
  },
  {
    version: "0.2.18",
    title: "Smarter rejoin + cross-device call fixes",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "The 'Ongoing call in this chat' rejoin banner now only appears when there's actually a live call to join — no more ghost banners.",
      "The 'Rejoin' button on call pills only shows when it makes sense to use it.",
      "Clicking Rejoin no longer drops you into a stuck 'calling' state when nobody is actually still in the call.",
      "Dismissing a stale incoming-call popup on a second device (web tab, etc.) no longer hangs up the call you've already answered on your main device.",
      "Accepting a call on one device now properly stops the ringtone and incoming popup on every other device or tab you're signed into.",
      "Window screen-share audio on Windows now works on more machines.",
    ],
  },
  {
    version: "0.2.17",
    title: "Rejoin polish + cross-device call sync",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Active calls in a DM now show a join banner at the top of the chat again instead of only being reachable from the history.",
      "Rejoining a call no longer re-rings the other person or leaves your other device ringing after you've already joined.",
      "Starting a fresh call now cleans up any stale 'ongoing' call left over from a previous disconnect.",
      "Window screen-share audio works on more Windows audio setups.",
      "Each chat now shows only ONE 'Ongoing Call' pill — duplicates from old call sessions are correctly shown as ended.",
      "Pressing the call button when there's already a live call in that chat now JOINS the existing call instead of starting a second one.",
      "Closing the app, losing connection, or backgrounding mid-call now correctly flips the call pill in chat to 'Call Ended'.",
      "Outgoing calls now stop ringing after 30 seconds instead of dragging on for minutes.",
      "Fixed calls auto-ending every few minutes for no reason — connected calls now stay connected as long as the other person is actually there.",
      "Backgrounding, locking your phone, or switching tabs mid-call no longer ends the call for the other person.",
      "A hangup signal from one of your other devices can no longer accidentally end a different live call you're in.",
      "Group chat unread badges in the sidebar now reliably show the GROUP icon instead of randomly showing the last sender's profile picture.",
      "The blue 'New Messages' bar and red 'NEW' divider in chats now stay visible until you actually scroll to the bottom or hit 'Mark as Read' — no more disappearing the moment you open a chat.",
      "Fixed a few small under-the-hood errors that could cause the occasional error screen.",
    ],
  },
  {
    version: "0.2.15",
    title: "Smoother calls during games + screenshare audio attempt",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice calls no longer lag or spike to 3000ms ping the moment you (or anyone in the call) opens a fullscreen game — Cubbly keeps audio and network at full priority even when another app takes focus.",
      "First attempt at fixing window screen-share audio on Windows (the proper fix landed in v0.2.16).",
    ],
  },
  {
    version: "0.2.13",
    title: "Smarter unread, link previews, video player, real message box & call conflict handling",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [
      "Links in chat are now clickable AND get a rich preview card showing the page title, description and image — fetched safely so it works even on private attachments and never leaks your IP.",
      "MP4, MOV and WebM video attachments now play with a built-in Cubbly video player — controls, fullscreen, save to disk, no more downloading just to watch a clip.",
      "Message input is now a real multi-line box: Shift+Enter for newlines, Enter to send, auto-grows up to 6 lines then scrolls — no more text marching off into infinity.",
      "Soft 1000-character limit on messages with a counter that appears at 750/1000, turns orange at 900, red at 1000.",
      "Discord-style 'NEW' divider now appears above the first unread message when you re-open a chat — sticks until you reply or leave + come back, so you can scroll past it as much as you want without losing your place.",
      "Blue 'New Messages — [count] · Mark as Read' bar pinned to the top of the chat (above any active call panel) — click 'Mark as Read' to dismiss, or just scroll to the bottom and it goes away on its own.",
      "Scrolling to the latest message now instantly clears the unread badge under the Cubbly logo — no more chasing a phantom red dot.",
      "Trying to start a call while you're already in one elsewhere now pops a clean confirm modal: 'You're already in a call on another device — disconnect & reconnect here?' (cross-device) or 'End your current call & start a new one?' (same device).",
      "iOS PWA splash now uses an animated fallback so the loader never appears frozen on iPhone home-screen launches.",
    ],
    bugFixes: [
      "Window screen-share audio on Windows now actually works — fixed the underlying issue that was silently dropping the capture stream.",
      "Camera tile no longer stays a black rectangle when the other person turns their camera off — now falls back to their avatar circle the moment they disable video.",
      "Settings → Notifications and → Advanced now match the same header style as the other settings pages.",
    ],
  },
  {
    version: "0.2.12",
    title: "Camera, volume, and screen-share audio fixes",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "DevTools is now reachable in the packaged desktop app via F12 or Ctrl/Cmd+Shift+I — when something breaks you can actually see why.",
      "Window-audio capture now collects detailed diagnostics so failures are easier to pinpoint and fix.",
    ],
    bugFixes: [
      "Right-click peer volume slider and 'Mute (you only)' now actually change what you hear — controls were silently disconnected before and now respond instantly.",
      "Volume controls now work even when the audio pipeline takes a moment to wake up — no more dead sliders.",
      "Remote camera tile now appears for the OTHER user the instant the track arrives when they turn their camera on mid-call.",
      "Per-window screen-share audio now correctly identifies the source window across all Windows versions — previously some windows were silently rejected, killing audio capture before it started.",
      "Browser tab option in the screenshare picker is now correctly labeled 'Browser Window' to match what it actually does.",
    ],
  },
  {
    version: "0.2.11",
    title: "Calls actually work: controls drive audio, peer cam visible",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "Right-click 'User Volume' slider, 'Mute (you only)', and the fullscreen viewer's slider now move REAL playback in 1-on-1 and group calls — pipeline resumes on the first interaction instead of staying silently suspended",
    ],
    bugFixes: [
      "CRITICAL: Per-window/tab audio capture is now actually active inside the packaged desktop app — was silently falling back to 'video only' for everyone before",
      "CRITICAL: Remote camera tile in 1-on-1 calls now appears for the OTHER user the moment frames arrive",
      "CRITICAL: Group call peer-camera tiles render whenever a video stream is present — fixes 'they turned camera on, I never saw it'",
      "Voice volume controls no longer get stuck silent when playback hasn't fully woken up — there's a fallback now so you always hear the call.",
    ],
  },
  {
    version: "0.2.10",
    title: "Ship fix: actual desktop rollout of call/audio repairs",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "Desktop updater now ships the real post-0.2.9 call fixes as a new app version so Electron can actually detect and install them",
    ],
    bugFixes: [
      "Fixed desktop users getting stuck on an older broken 0.2.9 build even after 'updating'",
      "Includes the already-implemented call fixes: remote camera visibility on mid-call enable, per-user volume/local mute for mic + screenshare audio in 1-on-1 and group calls, working fullscreen PiP, and per-window audio wiring",
    ],
  },
  {
    version: "0.2.9",
    title: "Group calls get per-window audio, camera fix, working volume + PiP",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "GROUP CALLS: Sharing a single window or browser tab in a group call now sends ONLY that app's audio (Spotify, a YouTube tab, your game's music) — same engine that 1-on-1 already uses",
      "Browser web app: sharing a tab in a 1-on-1 call now correctly carries that tab's audio (previously silently disabled)",
      "Right-click any user in a 1-on-1 OR group call → the volume slider (0–200%) and 'Mute (you only)' now actually work — controls BOTH that person's mic AND their screen-share audio",
      "Fullscreen screen-share viewer: Picture-in-Picture button now works — pop a friend's screen out into a floating window",
      "Fullscreen viewer's volume slider now goes 0–200% and shares state with the right-click menu",
    ],
    bugFixes: [
      "CRITICAL: Fixed remote camera tiles disappearing or never appearing in group calls when someone turned their camera on mid-call",
      "Group call window/tab share-audio no longer leaks your full system mix to everyone — only the chosen app's audio is sent",
      "Unified the 1-on-1 and group call audio so they always behave the same.",
      "Per-user volume / 'mute (you only)' were silently doing NOTHING in group calls — now wired up and remembered between calls.",
      "Per-user volume in 1-on-1 only affected the peer's mic, not their screen-share audio — both now respond to the same control.",
      "Fullscreen viewer's volume slider was changing the wrong thing — now actually controls what you hear.",
    ],
  },
  {
    version: "0.2.8",
    title: "Per-window audio + camera fix",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "MAJOR: When you share a single window or browser tab on Windows, only THAT app's sound is sent to the call (Spotify, music in your game, a YouTube tab, anything). No more 'audio only works when you share the whole screen'.",
      "Screen-share picker now tells you upfront that Window and Browser Tab shares carry per-process audio, not your full system mix",
    ],
    bugFixes: [
      "CRITICAL: Fixed turning your camera on mid-call showing the preview to YOU but never reaching the other person — the next camera flip now correctly streams both ways",
      "Window/tab share-audio no longer silently drops",
    ],
  },
  {
    version: "0.2.7",
    title: "Per-user volume, mobile polish & call-quality fixes",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "Right-click any peer's avatar in a voice call to open a Discord-style user controls menu — slide volume from 0% all the way up to 200% (default 100%)",
      "Per-user volume settings save forever — your custom levels for each friend persist across calls, reloads, and reinstalls",
      "Local 'Mute (you only)' option per peer — silence someone for yourself without affecting anyone else in the call",
      "The screen-share button in the bottom-corner voice card now opens the proper Cubbly screen-share picker (entire screen / window / specific app) instead of just sharing your full screen by default",
      "Mobile Settings is now a proper Discord-style two-pane sheet — categories list → detail view with a sticky back arrow and a visible close (X) button so you never get stuck",
      "Mobile DMs now open on a single tap (no more 'X appears first then tap again') — replaced the hover-X with a persistent ⋮ menu on touch devices",
      "Better behind-the-scenes diagnostics on call connect so we can spot routing issues faster.",
    ],
    bugFixes: [
      "CRITICAL: Sharing a single window or browser tab no longer leaks your entire system audio to the call — Windows can't isolate audio per app, so window/tab shares are now silent and only Entire Screen shares carry audio",
      "Fixed your camera STILL not appearing for the other person when you turned it on mid-call — the peer now properly renegotiates and the remote tile re-renders the moment frames start flowing",
      "Fixed messages sometimes appearing ABOVE the call pill in chat — the merge now interleaves messages and call events atom-by-atom so the order is always correct",
      "Fixed mobile bug where tapping a chat in the DM sidebar sometimes opened a different chat instead — navigation now commits before the panel closes",
      "Screen-share picker now warns you upfront that audio sharing only works for full-screen captures on Windows",
      "Fixed missing notifications, sound, and taskbar flash when a message arrived for the chat you had open but the app was minimized or behind another window — alerts now fire whenever the window isn't actually focused, even if you're 'on' that DM",
    ],
  },
  {
    version: "0.2.6",
    title: "Crash fix — app stuck on 'Cubbly hit a snag'",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed the desktop app crashing into the 'Cubbly hit a snag' error screen on launch right after auto-updating to v0.2.5.",
    ],
  },
  {
    version: "0.2.5",
    title: "Call quality, gaming performance & desktop polish",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "Window screen-share audio is FINALLY working on Windows — and now it sounds clear and stereo instead of muffled and crackly",
      "Screen-share quality settings actually do something now — picking 1080p/60fps stays sharp on the viewer's side instead of compressing to a pixelated mess",
      "Desktop notifications now flash the Cubbly icon in the Windows taskbar (Discord-style) when the app isn't focused",
      "New 'Launch Cubbly on system startup' toggle in Settings → Advanced (on by default, can now be turned off)",
      "Lower-latency calls everywhere — added a Frankfurt TURN relay so users in MENA, Africa and Europe get noticeably lower ping",
      "Faster connection setup — calls connect quicker thanks to ICE candidate pre-pooling and tuned WebRTC config",
      "Snappier voice — reduced inbound audio jitter buffer so conversations feel less delayed",
      "Cubbly is now MUCH lighter while you're in a game — the desktop app drops its CPU priority below your game so it stops fighting Marvel Rivals (and friends) for cycles",
      "Animations and rendering now cap to 30fps when Cubbly isn't focused, so you won't feel it eating GPU while you're playing",
      "Activity detection (the thing that scans for your running game) now polls way less often when a game has focus, eliminating the periodic stutter",
    ],
    bugFixes: [
      "Fixed your camera not actually appearing for other people in the call when you turned it on (it only showed for you)",
      "Fixed mute/deafen indicators only updating after a few seconds — they're now instant for everyone in the call",
      "Fixed iOS PWA push notifications not arriving even after granting permission — they now work like a real app",
      "Fixed mobile call overlay end-call button getting hidden behind the bottom safe area on iPhones",
      "Fixed GIF replies showing the full Giphy URL instead of a clean 'GIF' label",
      "Fixed chat layout cramping action buttons off-screen on narrow / vertical monitors",
      "Fixed Gaming Mode silently tanking app performance instead of optimizing it",
      "Fixed Cubbly causing in-game lag spikes even when Gaming Mode was off",
      "Fixed call quality degrading mid-match because the activity scanner was hammering the CPU",
      "Fixed speaking rings around user avatars not pulsing reactively in real calls — they now smoothly respond to volume for everyone in the call",
      "Fixed peer's speaking ring permanently freezing at zero after a network blip or track replacement mid-call",
      "Fixed speaking rings flickering on background noise the moment a call connected",
      "NEW custom Cubbly-branded fullscreen viewer for screen shares and camera tiles — replaces the generic Windows/Chrome video controls",
      "Fixed viewers being able to PAUSE someone else's screen share via the native browser controls — that's no longer possible",
      "Removed picture-in-picture, download, and playback-speed buttons from screen shares so viewers can only watch (with optional opt-in PiP via Cubbly's own button)",
      "Fixed call pill in chat appearing ABOVE messages for the receiver instead of always above all subsequent messages",
      "Mobile: bumped chat-header back button to 44px (iOS minimum tap-target) so it's no longer fiddly to hit",
      "Mobile: bottom nav now extends safe-area padding to landscape (iPhone Pro Max) so it isn't clipped by the notch",
      "Mobile: added a clear primary-color top bar to the active bottom-nav tab",
      "Mobile: minimized call pill now anchors above the bottom nav instead of overlapping it",
      "Mobile: switched to dynamic viewport height (100dvh) so the iOS keyboard no longer covers the message input",
      "Mobile: stop pull-to-refresh from accidentally firing inside the chat scroll on iOS Safari",
      "Mobile: stop iOS double-tap-zoom on message bubbles, buttons and links",
      "Mobile: lock the page behind the Settings modal so it doesn't scroll while you're editing settings",
      "Mobile: long DM/group names in the chat header now truncate cleanly instead of pushing the back button off-screen",
    ],
  },
  {
    version: "0.2.4",
    title: "Calling, screen share & mobile fixes",
    date: "2026-04-17",
    hero: bearImage,
    newFeatures: [
      "1-on-1 video calling — the camera button in DM headers now actually starts/toggles video for both desktop and mobile",
      "Fullscreen camera tiles — click any camera tile in a call to expand it to full window, just like screen sharing",
      "Bigger status indicators — idle, do-not-disturb and invisible icons now match the visual weight of the green online dot",
      "iPhone home-screen PWA support — installing Cubbly to your iOS home screen now actually loads instead of grey-screening",
    ],
    bugFixes: [
      "CRITICAL: Sharing a single window no longer leaks your entire system audio — window shares are now silent (audio only included when sharing the full screen)",
      "Fixed mute & deafen indicators not appearing for other people in the call — they now sync the moment the call connects",
      "Fixed remote camera not showing for the other person when you turned yours on mid-call",
      "Fixed reply previews flickering / disappearing for a split second after sending a message",
      "Fixed the Windows taskbar and notifications still showing the generic Electron icon instead of the Cubbly logo",
      "Fixed mobile (iOS Safari) voice calling being completely broken — mic, audio playback and level monitoring now work",
    ],
  },
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
