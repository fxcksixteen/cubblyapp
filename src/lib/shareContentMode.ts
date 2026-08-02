/**
 * Screen-share content mode (v0.4.27).
 *
 * A share is either MOTION content (games, video) or STATIC content
 * (documents, code, chat, browsers sitting still). The right encoder settings
 * are opposite for the two, and getting it wrong is very visible:
 *
 *   motion  -> contentHint "motion", degradationPreference "maintain-framerate"
 *              Sacrifice sharpness to keep the frame rate. A shooter at 15 fps
 *              is unusable no matter how crisp each frame is.
 *   static  -> contentHint "detail",  degradationPreference "maintain-resolution"
 *              Sacrifice frame rate to keep sharpness. A PDF at 720p smeared by
 *              a motion-tuned encoder is unreadable, and nobody cares that a
 *              still page renders at 8 fps.
 *
 * Before 0.4.27 both were hardcoded to the motion pair, which is why sharing a
 * text document looked pixelated top to bottom.
 *
 * ── HOW THE MODE IS CHOSEN ─────────────────────────────────────────────────
 * The user's explicit choice always wins and is remembered per source. "Auto"
 * resolves ONCE, before the encoder is configured, and never changes for the
 * life of the share — flipping contentHint/degradationPreference mid-share
 * forces libwebrtc to re-initialise the encoder, which is exactly the event
 * that produces a transient OpenH264 fallback (see the software-encoder clamp
 * in VoiceContext). A share that re-inits its encoder every time you stop
 * moving in a game would be worse than either fixed setting.
 *
 * Auto's signal is native Windows Graphics Capture frame arrivals. WGC only
 * delivers a frame when the window's content actually changes, so the arrival
 * rate IS the content-change rate: a game produces ~60/s, a static document
 * produces ~0/s. (Empirically confirmed: the fullscreen "Waiting for video…"
 * overlay used to misfire on static documents precisely because frames stop
 * arriving.) Where that signal isn't available — full-screen captures, the
 * getDisplayMedia fallback — we fall back to coarser rules rather than guess.
 */

export type ShareContentMode = "motion" | "detail";
export type ShareContentModeSetting = "auto" | ShareContentMode;

export interface ShareEncoderProfile {
  contentHint: "motion" | "detail";
  degradationPreference: "maintain-framerate" | "maintain-resolution";
  /** Upper bound on the negotiated frame rate for this mode. */
  maxFps: number;
}

/**
 * Static content gets capped at 30 fps: past that you are spending bitrate on
 * duplicate frames of a still page instead of on sharpness. Motion keeps
 * whatever the user configured.
 */
export const DETAIL_MODE_FPS_CAP = 30;

export function profileForMode(mode: ShareContentMode, requestedFps: number): ShareEncoderProfile {
  if (mode === "detail") {
    return {
      contentHint: "detail",
      degradationPreference: "maintain-resolution",
      maxFps: Math.min(requestedFps, DETAIL_MODE_FPS_CAP),
    };
  }
  return {
    contentHint: "motion",
    degradationPreference: "maintain-framerate",
    maxFps: requestedFps,
  };
}

/**
 * Native frame arrivals per second at or above this are treated as motion.
 * A game sits at the capture cap (30–60). Scrolling a document produces short
 * bursts but averages far below this over the sample window; a still document
 * produces almost nothing.
 */
export const MOTION_FPS_THRESHOLD = 12;

/** Resolve "auto" from a measured native capture rate. */
export function modeFromCaptureRate(framesPerSecond: number): ShareContentMode {
  return framesPerSecond >= MOTION_FPS_THRESHOLD ? "motion" : "detail";
}

/**
 * Resolve "auto" when no native capture measurement is available
 * (full-screen capture, or the getDisplayMedia fallback path).
 *
 * A whole monitor is treated as motion: it's the mixed case, and a monitor
 * share is far more often "watch me play/watch this video" than "read this
 * document". A window we know nothing about is treated as detail — an
 * unrecognised *window* is much more likely to be an app full of text than a
 * game, and games reach here only when native capture is unavailable.
 */
export function modeFromSourceKind(sourceId: string | null | undefined, isKnownGame = false): ShareContentMode {
  if (isKnownGame) return "motion";
  if (typeof sourceId === "string" && sourceId.startsWith("screen:")) return "motion";
  return "detail";
}

// ---- Per-source persistence of the user's explicit choice -------------------
// Keyed by window title / source id rather than the volatile numeric HWND, so
// re-sharing the same app later remembers what you picked.

const STORE_KEY = "cubbly-share-content-mode";

type Store = Record<string, ShareContentModeSetting>;

function readStore(): Store {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** Stable key for a source: the window/screen NAME, not its handle. */
export function shareModeKey(sourceName: string | null | undefined): string {
  return (sourceName || "").trim().toLowerCase().slice(0, 80) || "unknown";
}

export function getStoredShareMode(sourceName: string | null | undefined): ShareContentModeSetting {
  const v = readStore()[shareModeKey(sourceName)];
  return v === "motion" || v === "detail" || v === "auto" ? v : "auto";
}

export function setStoredShareMode(sourceName: string | null | undefined, setting: ShareContentModeSetting): void {
  try {
    const store = readStore();
    const key = shareModeKey(sourceName);
    if (setting === "auto") delete store[key];
    else store[key] = setting;
    // Bound it — one entry per distinct window title the user has ever shared.
    const keys = Object.keys(store);
    if (keys.length > 100) delete store[keys[0]];
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
}
