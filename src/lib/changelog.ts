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

export const CURRENT_VERSION = "0.2.13";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.13",
    title: "Screen-share audio, link previews, video player & a real message box",
    date: "2026-04-19",
    hero: bearImage,
    newFeatures: [
      "Links in chat are now clickable AND get a rich preview card showing the page title, description and image — fetched server-side so it works even on private bucket links and never leaks your IP",
      "MP4, MOV and WebM video attachments now render with a built-in Cubbly video player — controls, fullscreen, save to disk, no more downloading just to watch a clip",
      "Message input is now a real multi-line box: Shift+Enter for newlines, Enter to send, auto-grows up to 6 lines then scrolls — no more text marching off into infinity",
      "Soft 1000-character limit on messages with a counter that appears at 750/1000, turns orange at 900, red at 1000",
      "iOS PWA splash now uses an animated CSS fallback (breathing bear + pulse rings) since iOS Safari refuses to autoplay the webm — no more frozen splash on iPhone home-screen launches",
    ],
    bugFixes: [
      "CRITICAL: Window screen-share audio now actually works — root cause was AUDCLNT_E_UNSUPPORTED_FORMAT (HRESULT 0x88890021) because the native loopback engine refuses WAVE_FORMAT_IEEE_FLOAT; switched to PCM 16-bit stereo 44.1kHz (the only format Microsoft's official ApplicationLoopback sample uses) and added Int16→Float32 conversion on the JS side",
      "Camera tile no longer stays a black rectangle when the other person turns their camera off — now correctly checks the peer's is_video_on state and falls back to the avatar circle the moment they disable video",
    ],
  },
  {
    version: "0.2.12",
    title: "Camera, volume, and screen-share audio: fixed at the runtime layer",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "DevTools is now reachable in the packaged desktop app via F12 or Ctrl/Cmd+Shift+I — when something breaks you can actually see why instead of guessing",
      "Window-audio capture pipeline now logs every step (HWND parse, PID resolve, addon load, PCM frames, outgoing track) so failures are diagnosable in seconds, not patches",
    ],
    bugFixes: [
      "CRITICAL: Right-click peer volume slider and 'Mute (you only)' now ACTUALLY change what you hear — the per-peer gain pipeline was binding to a stale call state and silently never connecting; now uses a stable peer-id ref so it binds the moment the first audio packet arrives",
      "CRITICAL: Volume controls now work even when the WebAudio graph stays suspended — they fall through to the raw audio/video element's volume + muted, so the slider is never a dead control",
      "CRITICAL: Remote camera tile now renders for the OTHER user the instant the track arrives — when a peer turned on camera mid-call, event.streams[0] could be empty and the tile bound to null; we now synthesise a MediaStream from the raw track and force play() on every assignment",
      "CRITICAL: Per-window screen-share audio HWND parsing now accepts both decimal AND hex window handles — the previous decimal-only parser silently rejected hex sourceIds on some Windows versions, killing audio capture before it started",
      "Browser tab option in the Electron picker is now correctly labeled 'Browser Window' — it was never real tab capture, just a name-filtered window list, and the wrong label kept setting expectations the desktop app couldn't meet",
    ],
  },
  {
    version: "0.2.11",
    title: "Calls actually work: native binary loads, controls drive audio, peer cam visible",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "Right-click 'User Volume' slider, 'Mute (you only)', and the fullscreen viewer's slider now move REAL playback in 1-on-1 and group calls — the per-peer audio pipeline now resumes on the first click/keypress instead of staying silently suspended",
    ],
    bugFixes: [
      "CRITICAL: Native per-window/tab audio capture is now actually loaded inside the packaged Electron app — the previous loader silently failed to find the bundled .node binary because of a filename mismatch, so window/tab share audio quietly fell back to 'video only' for everyone. Now scans the prebuilds directory for any .node file and loads the first one that matches the addon ABI",
      "CRITICAL: Remote camera tile in 1-on-1 calls now appears for the OTHER user the moment frames arrive — the tile no longer waits on the lagging signaling boolean that was hiding the video even when the stream was live",
      "CRITICAL: Group call peer-camera tiles render whenever a video stream is present, not gated on the easily-missed isVideoOn flag — fixes 'they turned camera on, I never saw it'",
      "Native addon prebuild workflow now targets Electron 41 (matches the shipped runtime) instead of Electron 33 — even though NAPI is ABI-stable, this removes any chance of header drift on the next rebuild",
      "Per-peer GainNode pipeline no longer leaves the source <audio>/<video> element silently muted when the AudioContext is suspended — falls back to direct element playback so you never end up with dead controls AND no audio at the same time",
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
      "Fixed desktop users getting stuck on an older broken 0.2.9 build even after 'updating' — the patch now ships as 0.2.10 so auto-update sees it as newer",
      "GitHub native-addon prebuild workflow now pushes back to the branch correctly instead of failing on detached HEAD during the commit step",
      "Includes the already-implemented call fixes: remote camera visibility on mid-call enable, per-user volume/local mute for mic + screenshare audio in 1-on-1 and group calls, working fullscreen PiP, and native per-window audio wiring for Electron shares",
    ],
  },
  {
    version: "0.2.9",
    title: "Group calls get per-window audio, camera fix, working volume + PiP",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "GROUP CALLS: Sharing a single window or browser tab in a group call now sends ONLY that app's audio (Spotify, a YouTube tab, your game's music) — same native WASAPI engine that 1-on-1 already uses, no more 'audio either leaks everything or nothing'",
      "Browser web app: sharing a tab in a 1-on-1 call now correctly carries that tab's audio (previously silently disabled)",
      "Right-click any user in a 1-on-1 OR group call → the volume slider (0–200%) and 'Mute (you only)' now actually work — and they control BOTH that person's mic AND their screen-share audio (one slider for everything you hear from them)",
      "Fullscreen screen-share viewer: Picture-in-Picture button now works (no more silent fail) — pop a friend's screen out into a floating window while you keep doing other things",
      "Fullscreen viewer's volume slider now goes 0–200% and shares state with the right-click menu — adjusting one updates the other instantly",
    ],
    bugFixes: [
      "CRITICAL: Fixed remote camera tiles disappearing or never appearing in group calls when someone turned their camera on mid-call — newly negotiated tracks arrive in a 'muted' state and we now correctly listen for unmute (when frames actually start flowing) instead of clearing the tile",
      "Group call window/tab share-audio no longer leaks your full system mix to everyone — only the chosen app's audio is sent, the same way Discord does it",
      "Unified the 1-on-1 and group native-audio capture paths into one shared module so they can't drift apart again",
      "Per-user volume / local mute were silently doing NOTHING in group calls — now wired up and persisted forever in localStorage (settings carry across reloads, calls, and re-installs)",
      "Per-user volume in 1-on-1 only affected the peer's mic, not their screen-share audio — both are now routed through the same gain node",
      "Fullscreen viewer's volume slider was changing the wrong audio element (the hidden one kept playing) — now drives the actual playback pipeline",
    ],
  },
  {
    version: "0.2.8",
    title: "Native per-window audio + camera fix",
    date: "2026-04-18",
    hero: bearImage,
    newFeatures: [
      "MAJOR: Cubbly now ships its own native Windows audio engine — when you share a single window or browser tab, only THAT app's sound is sent to the call (Spotify, music in your game, a YouTube tab, anything). No more 'audio only works when you share the whole screen'. Built on Windows 10 20H2's process-loopback APIs the same way Discord does it. Bundled .node binary, no install steps.",
      "Screen-share picker now tells you upfront that Window and Browser Tab shares carry per-process audio, not your full system mix",
    ],
    bugFixes: [
      "CRITICAL: Fixed turning your camera on mid-call showing the preview to YOU but never reaching the other person — the receiving side now forces its video transceiver back to sendrecv on every mid-call re-offer so the next camera flip actually streams both ways",
      "Window/tab share-audio no longer silently drops — it routes through the new native capture path instead of being disabled",
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
      "Active ICE candidate pair (host / srflx / relay) and round-trip-time are now logged on every connect so we can verify whether calls are actually going through the Frankfurt TURN relay",
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
      "Fixed the desktop app crashing into the 'Cubbly hit a snag' error screen on launch right after auto-updating to v0.2.5 (activity poller was assigning a property to a primitive number — illegal in strict mode)",
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
