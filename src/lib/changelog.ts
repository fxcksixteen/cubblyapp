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

export const CURRENT_VERSION = "0.4.3";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.4.3",
    title: "Call reliability hotfix",
    date: "2026-07-03",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed calls sometimes stuck on “Ringing” after the other person picked up.",
      "Voice no longer stays laggy after launching a game mid-call.",
      "Screen sharing on the lowest quality is actually low-bandwidth now.",
    ],
  },
  {
    version: "0.4.2",
    title: "Shop previews + live profile edits",
    date: "2026-07-01",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed shop item preview icons not loading on the desktop app.",
      "Display name and username changes now update everywhere immediately without needing a refresh or restart.",
    ],
  },

  {
    version: "0.4.1",
    title: "Honey welcome fix",
    date: "2026-07-01",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed the Honey welcome pop-up image not loading on the desktop app.",
    ],
  },
  {
    version: "0.4.0",
    title: "Cubbly Alpha — Honey, Gems, and a whole lot more",
    date: "2026-05-01",
    hero: bearImage,
    newFeatures: [
      "Cubbly Honey subscriptions — Basic ($2.99/mo) and Standard ($7.99/mo), with annual plans and a save-20% discount on Standard.",
      "New /honey page with a cozy hero, monthly/annual toggle, and gifting.",
      "Gems: a new premium currency you can earn, spend in the shop, and gift.",
      "Wishlist system — add shop items to your wishlist and let friends gift them from your profile.",
      "Send Honey as a gift straight from any DM.",
      "Message Requests — DMs from non-friends land in a separate inbox you can accept or ignore.",
      "Custom Statuses — set an emoji + short text status that shows on your profile.",
      "Server settings, roles, invites, and channel creation for server owners.",
      "Rich gaming activity cards on profiles.",
      "@ mention autocomplete and emoji autocomplete in the composer.",
      "Premium shop cosmetics now include Cotton Candy and Hello Kitty motion-gradient name colors.",
      "Featured shop banners and a bigger, cleaner item preview.",
      "Bigger, portal-based profile modals that no longer clip inside chat panes.",
      "GIF right-click menu with save + favorite options.",
      "'Member since' line added to profile cards.",
      "Live shared-note editing — recipients you invite can edit the note in real time.",
      "View-once notes with burn-on-close and screenshot protection on desktop.",
      "Low-Power Mode toggle for desktop when Hardware Acceleration is off.",
      "Full call diagnostics modal with mic/camera checks.",
      "Muted DMs are now visually blurred in the sidebar so they don't grab your eye.",
    ],
    bugFixes: [
      "Massive voice call reliability overhaul — the green pickup button works consistently again and stale peer connections no longer break rejoin.",
      "Hardened the pickup handshake so accepting a call no longer leaves the other person stuck on 'Not in call'.",
      "Added a one-click pickup self-test in Call Diagnostics.",
      "Fixed DMs disappearing after leaving a shared server — old 1:1 conversations always reopen.",
      "Screensharing no longer muffles or mutes audio, and viewers get shared system audio.",
      "Server voice channels correctly show who's actually in the call.",
      "Incoming group calls are no longer swallowed when the app remounts or you toggle mute.",
      "Realtime messages and typing indicators survive fast navigation without dropping.",
      "Failed message sends now surface a toast instead of silently disappearing.",
      "Usernames are always lowercased at signup and in the database.",
      "Coin balance updates live after every earning event, with a reward toast.",
      "Wishlist toggle no longer double-fires on rapid clicks.",
      "Shop prices are now single-currency only: coin items buy with coins, gem items buy with gems, and gifts use a separate gem gift price.",
      "Screenshare picker no longer crashes on web when Electron isn't present.",
      "Icons stay visible when Hardware Acceleration is disabled.",
      "Fixed multiple security issues around coin minting, activity privacy, and realtime data leakage.",
    ],
  },


  {
    version: "0.3.23",
    title: "Direct-call join reliability fix",
    date: "2026-04-25",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed direct voice calls where the green pickup button could leave both users in separate fake call states until both sides manually used Join/Rejoin.",
      "Accept, Join, and Rejoin now use the same call-event-scoped offer/answer handshake, with forced fresh offers when the joining side asks for one.",
      "Stale peer connections are closed before rebuilding the offer path, so the staying caller reliably becomes the offerer and the joining peer reliably becomes the answerer.",
      "Voice signaling now ignores stale offers, answers, and ICE candidates from old call events to prevent old broadcasts from hijacking the current call.",
    ],
  },

  {
    version: "0.3.22",
    title: "Icon visibility fix in low-power mode",
    date: "2026-04-24",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed sidebar, composer, and menu icons appearing black/invisible when Hardware Acceleration was turned off — low-power mode no longer strips the filters that recolor icons.",
    ],
  },

  {
    version: "0.3.21",
    title: "Call SFX cleanup + view-once anti-screenshot",
    date: "2026-04-23",
    hero: bearImage,
    newFeatures: [
      "Owner-only 'Remove from group' option now appears when you right-click a member in a group chat you own.",
      "The display name and avatar at the top of a DM are now clickable and open that user's profile card — matches every other surface in the app.",
      "View-once shared notes now activate native screen-capture protection on the desktop app, so tools like Lightshot, Snipping Tool, OBS, and Discord screenshare see only a black window while the note is open.",
      "Low-power mode: when hardware acceleration is OFF, the app auto-strips heavy backdrop-blurs, big shadows, and decorative animations for a massive FPS boost on the machines that needed HA-off in the first place.",
    ],
    bugFixes: [
      "The bottom DM panel no longer says 'Ringing…' forever after a call goes unanswered — it now correctly flips to 'Not in call'.",
      "The 'stream ended' SFX no longer fires when you leave a call without ever sharing your screen.",
      "When a peer leaves a call, the staying user now hears the 'left call' SFX (previously only the person who left heard it), and the 'stream ended' SFX no longer stacks on top of it if they were sharing.",
      "Cross-device suppression: picking up a call on the desktop app no longer pops up an 'incoming voice call' toast on the web tab from the very person you're already talking to.",
    ],
  },

  {
    version: "0.3.20",
    title: "Call pickup overhaul + screenshare smoothness",
    date: "2026-04-22",
    hero: bearImage,
    newFeatures: [
      "Redesigned Share Note flow — multi-select recipients with a clean searchable picker, note preview card, and an iOS-style toggle for View Once.",
      "Shared notes now render as a beautiful accented card in chat instead of raw text, with title, preview, and a clear 'view once' lock badge.",
      "View-once notes are bulletproof: server-side burn via the new burn_view_once_note RPC permanently destroys the body after opening, plus blocked copy/cut/select/right-click/screenshot shortcuts and a blurred preview before reveal.",
      "Server members panel is now collapsible (matches the group chat panel), and right-clicking any member in a server or group sidebar opens a context menu with View Profile, Mention, and Copy User ID.",
      "Clicking a member in the server or group sidebar now opens their full profile card — same flow as the DM sidebar.",
      "Muted DMs/groups are now fully blurred in the sidebar and reveal on hover.",
      "Right-clicking a group chat now offers a 'Leave Group' option (permanent), in addition to 'Hide'.",
      "Screenshare end sound now plays reliably even when the shared window is closed externally.",
      "Installer trims landing-page background videos (~4.5 MB) that the desktop shell never displays.",
    ],
    bugFixes: [
      "Rewrote the green pickup-call accept path with explicit teardown of any stale RTCPeerConnection before answering — fixes 'accept does nothing' on direct calls.",
      "Screenshare degradationPreference is now 'maintain-framerate' in motion/ultra mode so games stay smooth instead of starting choppy and slowly recovering.",
      "Verbose [acceptDiag] / [shareDiag] logging added to capture the exact failure surface for the kaszy↔geassbound call.",
    ],
  },
  {
    version: "0.3.19",
    date: "2026-06-27",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Green Accept call button now goes through a direct, deterministic path — instantly answers using the prefetched offer with a single round trip instead of routing through the rejoin flow.",
      "Call pill now correctly says \"Join Call\" (instead of \"Rejoin\") for users who have never been in that call yet — same one-tap action either way.",
      "Crashed / power-loss / abrupt-close ghost participant rows are auto-cleared on the next Cubbly launch, so the rejoin pill appears for the other person again and you stop showing up as \"still in call\".",
      "Sidebar ping reading prefers the actual nominated direct (host/srflx) ICE pair over any TURN-relay pair, so the number reflects the real path your audio is taking.",
      "Muted DMs and groups are now visibly dimmed and softly blurred in the DM sidebar (bell icon stays crisp) so it's obvious which conversations won't notify you.",
      "Desktop: Chromium's on-disk cache is now hard-capped at 80 MB (media cache 40 MB), and any pre-existing oversized cache from older installs is auto-pruned on launch — the runtime install size will no longer balloon to 500+ MB after weeks of use.",
    ],
  },


  {
    version: "0.3.18",
    date: "2026-06-25",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Desktop app is dramatically smaller on disk — stripped Chromium's unused language packs, license docs, default-app shell, software-renderer fallbacks (SwiftShader/Vulkan), debug symbols, and source maps from every install.",
    ],
  },

  {
    version: "0.3.17",
    date: "2026-04-22",
    hero: bearImage,
    newFeatures: [
      "Type @ in any chat to actually tag people — tagged users get a desktop notification + sound even when they're on Do Not Disturb (just like Discord).",
      "Mute any DM or group chat: right-click them in the sidebar → Mute Conversation (15m / 1h / 3h / 8h / 24h / forever).",
      "Muted conversations stay completely silent — no sound, no desktop ping, no DND bypass for mentions — and show a 🔕 in the sidebar.",
      "Right-click a GIF for the same options you get on images (copy, save, open).",
      "Click the “+” next to the reaction shortcuts to pick from every Unicode emoji (~1800, full Smileys/People/Animals/Food/Travel/Activities/Objects/Symbols/Flags).",
      "Hardware acceleration toggle in Settings → Advanced for older GPUs or driver glitches.",
      "Profile modals are noticeably bigger and easier to read.",
      "Petite badge has been renamed to “Cute” with a fresh description (Aria keeps the original).",
    ],
    bugFixes: [
      "Accepting an incoming call now uses the exact same rock-solid path as the Rejoin button — no more silent green-button failures.",
      "Both sides of a call now hear the screenshare start/stop sound effects.",
      "Hovering a message only highlights that single message, not the whole batch from the same author.",
      "Desktop installer slimmed down — aggressive pruning of locales, source maps, and unused node_modules keeps it under the 150 MB target.",
    ],
  },

  {
    version: "0.3.16",
    title: "Server voice channels get their own look, DM calls fixed, server audio gets DM quality",
    date: "2026-06-22",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice/video calls between specific friend pairs now work — the mic was failing to initialize with a silent error, which made calls hang forever on 'Calling…' / 'Ringing…' and the Accept button do nothing.",
      "Server voice channel audio no longer sounds muffled or underwater — it now matches DM call quality (48 kHz stereo, high-bitrate Opus).",
      "Server voice channels have a new dedicated UI: rectangular member tiles in a responsive grid, active screen share promoted to a large tile at the top, and a single full-width bottom action bar. No more DM-group panel reused inside servers.",
      "The 'Voice Connected' card at the bottom of the channel sidebar now actually appears the moment you join a server voice channel.",
      "Screen-share button is present in the new server-call bottom bar.",
      "Your profile panel (avatar, name, mute, deafen, settings) now shows at the bottom of the server sidebar, just like in DMs.",
      "Fixed a crash when starting a call right after leaving one.",
    ],
  },





  {
    version: "0.3.15",
    title: "Calls between specific friend pairs work again, no more reciprocal ringing deadlock",
    date: "2026-06-22",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice/video calls between specific friend pairs (the kaszy ↔ geassbound case) work again. v0.3.14 added an unconditional 'incoming-call' ring to the peer even on the rejoin path as a ghost-row fallback — but when the peer was actually live, that fresh ring made their client treat the rejoin as a brand-new inbound call, fire back its own 'ready-for-offer', and flip the REJOINER into the offerer role. That's why Rejoin opened the call panel stuck on 'Ringing…' and the green Accept button appeared to do nothing on the receiver while the caller silently rolled over into 'Not in call' after the 30s ring timeout. The ring is now sent only on brand-new calls; the ghost-row case is still handled because the liveness check correctly falls through to the new-call branch when the peer isn't actually live.",
      "Clicking the voice or video call button on a DM where the other person is already ringing YOU now picks up the call instead of starting a second outgoing call. Before, both people clicking 'call' around the same moment ended up with two separate ongoing call events for the same conversation, each side ringing the other and neither one able to connect. The buttons now route to Accept whenever there's an incoming call for the active DM.",
    ],
  },

  {
    version: "0.3.14",
    title: "Ghost calls exorcised, profile modal stops getting squished on Space",
    date: "2026-06-21",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice calls between specific friend pairs work again. A single conversation could get permanently poisoned by a leftover 'ghost' participant row from an older session — a row with no heartbeat but still marked as in-call. Every fresh call attempt in that DM was silently hijacked into a rejoin against the ghost, so the peer never rang and the caller sat stuck on 'calling…'. The freshness check now ignores rows that have never sent a heartbeat, soft-closes stale participant rows on the way in, and always fires the incoming-call ring to the peer as a fallback even on the rejoin path — so a stuck row can never silently kill a DM's call ability again.",
      "Profile modal no longer renders clipped inside the DM sidebar on the Space theme. The Space sidebar uses a backdrop blur, and `backdrop-filter` quietly turns its element into a containing block for `position: fixed` children — which trapped the 440px-wide profile modal inside the ~230px sidebar column. The profile card now mounts through a portal on `document.body`, so it always covers the full viewport regardless of theme effects.",
    ],
  },

  {
    version: "0.3.13",
    title: "Calls actually go through, friends stop vanishing from the sidebar",
    date: "2026-06-07",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice calls finally work end-to-end again. The receiver now pre-fetches the SDP offer the instant the ring arrives, every critical signaling broadcast (offer, answer, ready-for-offer, peer-leave) is awaited and retried until the realtime server acknowledges it, Accept and Rejoin both set up the call participant row before SDP can connect (so the other side stops hallucinating 'Not in call' after you join), duplicate offer retries can no longer wipe a freshly-established peer connection, and the global incoming-call listener stays mounted across call state changes so notifications and dismissals are never lost in a teardown window.",
      "Friends like Aria no longer magically disappear from your DM sidebar when you click off their chat. The conversation list was loading 'last message' via one big batched query capped at ~200 rows — if any other DM had a recent burst of activity, older friends' last-messages fell outside the window, lastMessage came back empty, and the sidebar filter hid them on the next refetch. Last messages are now fetched per conversation in parallel so every DM keeps its preview and stays pinned in the sidebar.",
    ],
  },

  {
    version: "0.3.12",
    title: "Calls actually go through, friends stop vanishing from the sidebar",
    date: "2026-06-06",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Voice calls finally work end-to-end again. The receiver was waiting until you clicked Accept to ask the caller for the SDP offer, so a single dropped broadcast left Accept doing nothing and Rejoin opening a fake local call with no peer. The receiver now pre-fetches the offer the instant the incoming-call notification arrives (with retries), so Accept becomes a single fast setRemoteDescription/answer hop and both sides actually connect.",
      "Friends like Aria no longer magically disappear from your DM sidebar when you click off their chat. The conversation list was loading 'last message' via one big batched query capped at ~200 rows — if any other DM had a recent burst of activity, older friends' last-messages fell outside the window, lastMessage came back empty, and the sidebar filter hid them on the next refetch. Last messages are now fetched per conversation in parallel so every DM keeps its preview and stays pinned in the sidebar.",
    ],
  },


  {
    version: "0.3.11",
    title: "Friends reappear, calls actually reach the other side",
    date: "2026-06-06",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Clicking 'Message' on a friend you share a group chat with no longer opens that group chat instead of the real 1:1 DM. The create-DM lookup was matching ANY conversation containing both users — group chats included — so it kept hijacking the DM and your friend would also vanish from the sidebar. It now only matches a true 1:1 DM (and creates a fresh one when none exists), so the friend reappears in the DM sidebar the moment you message them.",
      "Voice calls reach the other side again. The signaling channel was being cached across calls without checking which conversation it belonged to, so accepting an incoming call or hitting Rejoin sometimes ended up listening on a stale channel from a previous chat — the caller's offer never arrived, your accept/rejoin appeared to do nothing on the caller's end, and you stayed marked as 'Not in call.' The cached channel is now keyed to the conversation and torn down whenever you move to a different call, plus the accept/rejoin path logs every signaling hop so any remaining issue is much easier to pinpoint.",
    ],
  },

  {
    version: "0.3.10",
    title: "Coins are flowing and calls actually connect again",
    date: "2026-06-04",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Coins are being awarded again. The activity-coins and message-coins flow had stopped paying out — voice minutes, gaming minutes, and the per-100-messages reward weren't crediting balances or firing the coin-earned notification + sound. The earning RPCs and triggers are restored so the 30-minute voice/gaming blocks and 100-message blocks tick balances up and surface the notification like before.",
      "Voice calls work again. Calls were hanging up the instant either side tried to join because brand-new call events were being auto-marked stale before the first participant heartbeat could land. Fresh call events now get a grace window so the first heartbeat from each side is always counted before any stale-cleanup runs.",
      "CubblyBot voice-call test path actually starts a real call now instead of routing the call button through the chat-bot edge function and replying with text. Tapping the call button on the CubblyBot DM goes straight into the loopback call flow, which is the intended way to self-test the call stack.",
      "Big drop in web app lag, especially in the DM sidebar. The conversation list was firing one 'last message' query per conversation on every realtime tick (N+1) and refetching the whole list on every messages/profiles event. Last-message fetches are now batched into a single query and realtime refetches are debounced and narrowed to events that actually matter, so navigating between chats and tabs is snappy again.",
      "chat-with-bot edge function now actually feeds the latest user message into Gemini when called from the voice-call notification path, instead of sending an empty turn that produced the generic 'I encountered an issue processing that' error.",
    ],
  },

  {
    version: "0.3.9",
    title: "Hotfix: girlfriend can actually join the call now",
    date: "2026-05-27",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed the deadly bug where accepting a 1:1 call would leave the second person stuck and never actually placed in the call with the caller. The first ready-for-offer broadcast was racing the signaling subscribe and getting lost, so the caller's offer never made it back. The accepting side now retries ready-for-offer up to 4 times in the first 5 seconds, and the caller re-broadcasts the existing offer instead of silently dropping a duplicate ready-for-offer.",
      "Personal Notes attachments are now recovered from even more legacy shapes — including notes that saved their files under 'files', 'media', 'images' or 'attached' keys instead of 'attachments'. Old notes with those metadata shapes will surface their attachments in the attachment strip again instead of staying invisible.",
      "Desktop installer is now drastically smaller. The previous build was sweeping the entire dev tree into the installer; the new allow-list packages only the renderer build, the Electron runtime files, the WASAPI audio prebuilds, and the runtime dependencies the auto-updater + settings store actually need.",
    ],
  },


  {
    version: "0.3.8",
    title: "Hotfix: instant call kicks",
    date: "2026-05-27",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed a deadly bug where joining or being joined on a 1:1 voice call would instantly hang you up. A transient WebRTC ICE 'disconnected/failed' during the join handshake was tearing down the whole call; now we keep the call alive and try an ICE restart instead of kicking either side out.",
      "Stale 'peer-leave' broadcasts from a previous call attempt in the same chat can no longer end your brand-new call — leave signals are now scoped to the specific call event id, so a delayed broadcast from the old attempt is ignored.",
      "Signaling errors during accept/join/rejoin no longer auto-end the call. Transient SDP failures are logged and the call stays up so WebRTC can recover or you can hang up manually — instead of getting yanked out mid-handshake.",
    ],
  },

  {
    version: "0.3.7",
    title: "Hotfix: call pills and notes attachments",
    date: "2026-05-26",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed web/desktop call pills immediately flipping to 'Call Ended 00:00' when a call starts. The chat UI no longer fake-converts extra ongoing call rows into ended pills, and the call startup path now creates the call event before heartbeating the participant row so cleanup checks can't race the new call closed.",
      "Personal Notes attachments now recover storage paths from legacy signed URLs too, so old note images/files saved with url/signedUrl metadata show up again instead of disappearing from the attachment strip.",
      "Server voice-channel calls no longer start with an elapsed timer of '1:29:00' (or any other huge number). Joining a server voice call now only inherits the existing started_at when another participant is actually freshly live; stale ghost call_events get closed and a brand-new event with a fresh start time is created instead.",
      "Removed the floating bottom 'in-call' pill that appeared in the middle of the screen on web/desktop when you were on a call but not viewing that chat. The sidebar voice card + the call's own chat already cover this, and the floating pill was just adding noise.",
    ],
  },

  {
    version: "0.3.6",
    title: "Hotfix: voice calls, server header & legacy notes attachments",
    date: "2026-05-26",
    hero: bearImage,
    newFeatures: [
      "Calls now support multiple simultaneous screenshares — you and your friend can both stream at the same time, and you'll see both streams independently instead of one overwriting the other.",
      "Your own screenshare preview now pauses and blurs with a glassmorphism overlay when Cubbly is not focused ('Stream paused — your stream is still live, this just saves resources'). The outgoing stream keeps running for your peer; only the local preview is throttled.",
    ],
    bugFixes: [
      "Fixed call pills in chat instantly showing 'Call Ended -1:-1' the moment a call started. Tiny clock drift between your device and the server made the calculated duration briefly negative — durations are now clamped so a just-started call never renders as ended with garbage time.",
      "Server tabs no longer show the Friends header (Online / All / Pending / Blocked / Add Friend) across the top — that bar is now hidden inside a server, since the server view already has its own server-name and channel chrome.",
      "Old personal-notes attachments (images and files saved from earlier desktop versions, or with slightly different metadata shapes) now show up again. The loader accepts more legacy key names for storage path and IV, no longer drops attachments missing an IV, and falls back to serving the raw bytes when an old blob can't be decrypted — so your old photos and files in Private Notes are visible and downloadable instead of silently disappearing.",
    ],
  },

  {
    version: "0.3.5",
    title: "Hotfix: desktop app boots again",
    date: "2026-05-26",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Fixed a desktop startup crash introduced in v0.3.4 where the app died on launch with 'Cannot find module builder-util-runtime'. A too-greedy packaging filter was stripping a runtime dependency of the auto-updater out of the installer. The v0.3.5 installer ships it correctly and Cubbly opens normally again.",
    ],
  },

  {
    version: "0.3.4",
    title: "Cozier shop, polished Space theme & three new animated themes",
    date: "2026-05-26",
    hero: bearImage,
    newFeatures: [
      "Three brand-new animated themes added to the shop: Sky Dusk (drifting clouds over a sunset gradient), Snowy Drift (gentle falling snow over frosted blue), and Moonlit Hills (layered silhouettes under a glowing moon, drifting wisps, and warm fireflies blinking above the ridges).",
      "Animated Themes group in the shop now shows real, live mini-previews — actual stars and shooting streaks for Space, drifting clouds for Sky, falling flakes for Snowy, and the moonlit hills scene with stars and fireflies — instead of flat gradient swatches.",
      "Server voice-channel mini call card in the DM sidebar: when you're in a server voice call, the sidebar now shows a compact card with the channel name and live participants while you keep browsing.",
    ],
    bugFixes: [
      "Notes attachments: images saved from the iOS app and the desktop app now display properly again — they were silently failing to render after an earlier upload-path change.",
      "Unequipping a theme from the shop now takes effect instantly on desktop — no more 'unequip looks like it did nothing until I refresh with Ctrl+R'.",
      "Space theme: pop-up modals (Settings, Add a Server, etc.) now open correctly instead of being clipped or hidden behind the starfield. Modals are now portaled to the document body and properly carry the app's theme tokens, so backgrounds aren't transparent anymore.",
      "Space theme: the falling star is now smooth and continuous from top-right to bottom-left — no more mid-flight pause — and now fires every 15–30 seconds instead of every 30–90.",
      "Space theme: the What's New changelog modal now correctly opens above the Settings modal instead of being trapped behind it, thanks to a proper z-index layering pass that no longer forces every dialog onto the same layer.",
      "Add a Server modal no longer renders with a transparent background under the Space theme (and any other theme using a custom backdrop) — the portal wrapper now inherits the app's themed surface tokens.",
      "Moonlit Hills is now genuinely animated: pulsing moon glow, three slow wispy clouds drifting across the sky, and a layer of warm fireflies floating and blinking above the hill silhouettes — on top of the existing twinkling stars.",
      "Sky Dusk, Snowy Drift, and Moonlit Hills are now grouped under Animated Themes alongside Space (instead of their own loose 'Theme' bucket) and are priced in line with other premium animated themes.",
      "Petite badge now has a proper shop description like every other badge.",
    ],
  },

  {
    version: "0.3.3",
    title: "Servers that actually work, reliable rejoin & settings parity",
    date: "2026-05-22",
    hero: bearImage,
    newFeatures: [
      "Servers now have a proper dedicated layout — when you open a server, the DM sidebar steps aside and you get the server's own text + voice channel list instead.",
      "Voice channels in servers are live: click one to join the group call, see who's in there, and leave anytime.",
      "Every Settings tab now uses the same toggle component, row layout, and spacing as the Chat tab — full visual parity across Notifications, Privacy, Accessibility, Content & Social, Activity Privacy, Gaming Mode, Language & Time, and Advanced.",
    ],
    bugFixes: [
      "Rejoining a call now actually puts you back into a real, working WebRTC session with your peer — the Rejoin button uses the exact same code path as the top-right call button, clears any stale ringing state, revives your participant row, and forces a fresh offer so audio/video really flows.",
      "Server invites no longer fail with 'gen_random_bytes does not exist' — invite codes are now generated without depending on pgcrypto.",
      "Message deletes now sync instantly across both sides of a conversation via realtime DELETE events on the messages table.",
      "Switching appearance themes is now idempotent and synchronous — no more needing to click a theme twice to make it stick.",
      "Replaced the gamer badge artwork with the new white-bear-with-headphones PNG.",
      "Server channels: 'Select a channel' placeholder is gone — the selected channel's conversation now loads correctly with its real name in the header.",
      "Launching a game during a call no longer freezes Cubbly — the native Windows audio capture init is wrapped with a hard 2-second timeout, so a stuck driver falls back to video-only screenshare instead of locking the call.",
      "Personal Notes: long lines now scroll horizontally instead of getting clipped, text selection works again, and every toolbar control has a proper hover/cursor state.",
      "Notifications tab: 'Send Test Notification' now requests browser permission when needed, shows a clear toast when notifications are blocked or unsupported, and disables the button when it can't possibly work. Every call sound (outgoing ring, incoming call, join, leave, mute, unmute, deafen, undeafen, screenshare start/stop) is now testable from its own button.",
      "Desktop installer is significantly smaller: build now ships only the production bundle + the win32-x64 native prebuild, drops source maps, READMEs, test folders, and non-English Electron locales, and uses maximum asar compression.",
    ],
  },
  {
    version: "0.3.2",
    title: "Rock-solid presence, rejoinable calls & screenshare polish",
    date: "2026-05-09",
    hero: bearImage,
    newFeatures: [
      "Online status indicators are now 100% database-driven and version-tolerant — anyone with an active device (even on older builds) shows up online, because presence unions the new profile heartbeat with existing per-device session timestamps. No more friends stuck offline while they're literally typing.",
      "Rejoining a call now reuses the existing call event instead of starting a new one — the call duration timer keeps counting from the original start, and you slide right back into the same WebRTC session.",
    ],
    bugFixes: [
      "Presence now converges instantly between desktop and web — any change to a friend's online state is pushed through realtime so both apps update at the same moment without needing a refresh.",
      "Status indicators no longer flap online ↔ offline. Removed the realtime reconnect loop that kept tearing down the global presence socket and added debouncing on wake events.",
      "Call pills no longer disappear after a 2-person call ends — they correctly stick around in the chat as a normal message.",
      "Game streaming feels real-time again: lowered the inbound video jitter buffer (playoutDelayHint 0.05s, jitterBufferTarget 50ms) on every screen-share receiver, so frames play out as they arrive instead of stockpiling 200-400 ms of delay.",
      "Game streaming bitrate is now scaled and capped (≤4 Mbps) with degradation preference set to balanced, so a single screenshare can't starve voice for either user.",
      "Mute / unmute / deafen / undeafen sound effects now play consistently — the mic and headphone buttons in the bottom of the DM sidebar trigger the same SFX whether you're in a call or not.",
      "Personal notes: attached images stay as files by default and only appear inline when you press Insert — every attachment lives in the bottom strip with quick Insert / Uninsert / Download / Delete actions. Inserted images can be dragged to reposition anywhere in the body, and a single click opens them fullscreen. Still end-to-end encrypted.",
      "Fixed the 'cannot add postgres_changes after subscribe' errors on the badges and name-colors realtime channels that were spamming the console after HMR / fast page transitions.",
    ],
  },
  {
    version: "0.3.1",
    title: "Settings overhaul, themes restored & call stability",
    date: "2026-05-05",
    hero: bearImage,
    newFeatures: [
      "Devices tab now lives under User Settings and shows every signed-in device with its platform, last-seen time, and a one-tap 'Sign out' button — plus 'Sign out everywhere else' to nuke every session except this one.",
      "Settings tabs got a full visual pass: consistent cards, single titles, unified toggles, and proper descriptions across Data & Privacy, Accessibility, Content & Social, Chat, Notifications, Voice & Video, Keybinds, Language & Time, Activity Privacy, Gaming Mode, and Advanced.",
      "Shop badges now show the actual 3D badge artwork (Chat Champ, Gamer, Night Owl, etc.) in both the Shop grid and your My Account badges section, instead of placeholder icons.",
    ],
    bugFixes: [
      "Built-in themes (Cubbly, Onyx, Light) apply correctly again — fixed a regression where the new shop-theme bridge was overwriting your equipped local theme with the default on every login.",
      "Muting and deafening yourself in a voice call no longer kills the call audio. Switched to clean track.enabled toggling so unmuting/undeafening is instant and never requires a rejoin.",
      "Settings tabs no longer show two stacked titles — the modal header is the single source of truth for tab name + description.",
      "Data & Privacy and Accessibility tabs no longer render their toggles in the Cubbly accent color when those toggles are off.",
    ],
  },
  {
    version: "0.3.0",
    title: "Shop, encrypted notes, themes & badges",
    date: "2026-05-04",
    hero: bearImage,
    newFeatures: [
      "Cubbly Shop is live — earn coins by chatting, hanging out in voice, and playing games, then spend them on cosmetics. Open the Shop tab and tap your coin pill for the full breakdown.",
      "Personal Notes — a brand-new tab between Friends and Shop, gated by a 4-digit PIN you set once. Notes (and any attached files) are encrypted on your device before they ever leave it. Optional 'trust this device' skips the PIN on devices you've already unlocked once.",
      "Name colors — static, gradient, and animated motion gradients you can equip to make your name stand out everywhere on Cubbly.",
      "Profile badges — a fresh set of 3D collectible badges that show next to your name in chats, profiles, member lists, everywhere.",
      "App themes — a whole catalog of new looks, including the Grok-styled Space theme with drifting stars and falling shooting stars.",
      "Tons of new sound effects: mute/unmute, deafen/undeafen, joining a call, screen-share start/stop, plus the coin-earned and coin-spent jingles.",
      "Big settings expansion: Devices, Data & Privacy, Chat, Language & Time, Content & Social, Accessibility, and Keybinds tabs are now real and configurable.",
      "Locked shop items now show up inside Settings → Appearance and Settings → My Account too — blurred and one tap away from the shop, equippable in place once you own them.",
      "Right-click any DM or group in the sidebar to instantly Mark As Read — clears its unread badge and the red pill at the top of the server sidebar without opening the chat.",
      "Right-click any personal note for a clean menu with Open & Edit, Pin, Duplicate, Copy Text, and Delete.",
      "Deleting a personal note now shows a polished confirmation modal with the note's title, so you never wipe one by accident.",
      "Brand-new server creation modal: pick between creating a server from scratch, joining via invite, or importing a public Discord template URL — the importer recreates all categories and channels for you.",
      "Polished install experience: high-resolution PWA icons, Apple touch icon, and maskable Android icon so Cubbly looks crisp when installed on any device.",
    ],
    bugFixes: [
      "Status indicators no longer flicker between online and offline when one of your devices (especially the iOS app) backgrounds. You're shown as online as long as ANY of your devices is connected.",
      "Muting or deafening yourself in a voice call no longer corrupts the audio for the rest of the call. Undeafening cleanly restores everyone's audio without needing to rejoin.",
      "Clicking 'Rejoin' on a call pill now actually drops you back into the existing call your friend is still in, with audio working immediately.",
      "The coin pill no longer follows you across every tab — it now only appears on the Shop, and tapping it opens a proper info modal explaining how coins work.",
      "Personal Notes editor saves correctly when you switch between notes or close the tab mid-typing — no more lost edits.",
    ],
  },
  {
    version: "0.2.31",
    title: "Calls actually reach the other side",
    date: "2026-05-04",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "iOS-initiated calls now actually ring you on web and desktop — fixed a realtime channel race that was dropping the incoming call notification before it left the phone, which is why your friend looked like she was ringing you but no call ever came through.",
      "When the person you're in a call with leaves, their avatar in your call panel now flips to 'Not in call' the instant they hang up, even if the realtime update behind the scenes was delayed or dropped.",
      "Hanging up a call the other person never picked up no longer flashes a confusing 'Ongoing → Call ended' pill in the chat — it now correctly shows as a missed call.",
    ],
  },
  {
    version: "0.2.30",
    title: "Rejoin actually rejoins",
    date: "2026-05-04",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Clicking Rejoin in the chat now drops you straight back into the same ongoing call your friend is still in — no more 'Ringing…' against an empty new call.",
      "When someone leaves a call, the remaining peer's UI now flips that person to 'Not in call' immediately instead of leaving them looking like they're still active.",
    ],
  },
  {
    version: "0.2.29",
    title: "Calls polish: fullscreen volume, smoother rings, reliable rejoin",
    date: "2026-05-03",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Screen-share volume now stays at the level you set after exiting fullscreen — it no longer snaps back to 100%.",
      "Green speaking-ring indicators are smooth and reactive again, lighting up promptly at normal speaking volume just like before.",
      "Hanging up and clicking Rejoin in the chat now actually puts you back in the SAME ongoing call your friend is still waiting in, instead of starting a brand-new one.",
      "When someone leaves a call, the other person's avatar now updates to 'Not in call' immediately rather than appearing stuck as still in the call.",
    ],
  },
  {
    version: "0.2.28",
    title: "Emergency call + chat history hotfix",
    date: "2026-05-03",
    hero: bearImage,
    newFeatures: [],
    bugFixes: [
      "Desktop and web chat threads now load true older history again when you scroll up, including normal messages and call pills in the right order.",
      "Fixed a call startup crash where answering or starting a voice chat could hit the snag screen with D.rpc(...).catch is not a function.",
      "Call signaling now handles pickup/start flows more defensively so desktop and web users can ring, answer, and join without the app crashing.",
    ],
  },
  {
    version: "0.2.27",
    title: "Cleaner calls, image right-click, friendlier chat",
    date: "2026-05-03",
    hero: bearImage,
    newFeatures: [
      "Right-click any image in chat (or in the fullscreen viewer) to save it, copy it, copy the link, or open it in a new tab.",
      "On the iOS PWA, calls now have a brand-new fullscreen view with bigger avatars and a glowing ring around whoever is talking.",
    ],
    bugFixes: [
      "When you ring someone and they don't pick up, the call panel now clearly says \"Not in call\" instead of pretending it's still ringing.",
      "Cleaned up ghost \"Rejoin\" pills — if nobody is actually in a call anymore, the call ends instead of leaving you hanging.",
      "Tapping Rejoin no longer fails or drops you into a dead call.",
      "Screen-share volume sliders now actually control the audio you hear — no more sliders that did nothing.",
      "Chats stay in sync after your phone has been locked or backgrounded for a while — no more missing your friend's latest messages until you re-open the thread.",
      "Group calls now feel just as solid as 1-on-1 calls.",
      "Removed a duplicate floating call indicator on the iOS PWA so there's only one clear pill.",
    ],
  },
  {
    version: "0.2.26",
    title: "Calls that don't bail on you, plus a smarter mic test",
    date: "2026-04-28",
    hero: bearImage,
    newFeatures: [
      "The mic test in Voice & Video now reflects EVERY change you make in real-time — swap input device, change output, drag the input volume slider, or move the sensitivity threshold and you'll hear/see it instantly without restarting the test.",
      "The level bar in mic test now shows your sensitivity gate as a vertical line, with the segments below the gate dimmed — so you can actually see whether your voice is loud enough to be transmitted.",
    ],
    bugFixes: [
      "Calls no longer end when ONE person hangs up. The other side stays in the call, and anyone in the conversation can still hit Join — exactly like Discord. The call only fully ends when the last person leaves.",
      "The 30-second ringing timeout now ONLY stops the ringing sound and incoming-call overlay — it no longer kills the call. The callee can still join from the chat thread pill afterwards, and the caller stays in the call alone waiting for them.",
      "The 'Ongoing call — Join' pill in chat threads now ONLY appears when there is genuinely at least one user actively in the call. No more ghost pills for calls nobody is in.",
      "Muting now uses BOTH track.enabled = false AND sender.replaceTrack(null) on the mic, so peers (including the iOS PWA) hear absolute silence — fixes the bug where the iOS PWA could still hear a desktop user who had muted themselves.",
      "Added a defensive listener on the receiving side: when a peer broadcasts that they're muted, we also force their inbound mic gain to 0 locally, so even if their client misbehaves you hear nothing.",
    ],
  },
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
      "Lower-latency calls everywhere — added a new relay so users in MENA, Africa and Europe get noticeably lower ping",
      "Faster connection setup — calls connect quicker than before",
      "Snappier voice — less audio delay so conversations feel more natural",
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
      "Group voice calls — start a call in any group DM and ring every member at once",
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
      "Per-peer audio level monitoring no longer leaks resources on call end",
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
