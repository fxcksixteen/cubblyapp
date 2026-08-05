/**
 * Automatic screen-share content optimisation (v0.4.28).
 *
 * v0.4.27 shipped a manual Motion/Text toggle. That was the wrong answer: it
 * made the user responsible for a decision they shouldn't have to think about,
 * and — more importantly — a binary choice is wrong for the single most common
 * share there is. A browser window with a video playing next to readable text
 * is neither "motion" nor "text", and forcing it into either bucket ruins one
 * half of the picture.
 *
 * So: no user-facing choice at all, three classes instead of two, and
 * continuous re-evaluation while the share runs.
 *
 *   STATIC  documents, code, a paused browser, a still game menu.
 *           Nothing moves. Spend everything on sharpness; frame rate is free
 *           to collapse because there is nothing to animate.
 *             contentHint "detail" + maintain-resolution + low fps
 *
 *   MIXED   a browser playing video, a video call, a slide deck being scrolled,
 *           an IDE with a running preview. Some of the frame moves constantly
 *           while the rest must stay readable. THIS is the case the 0.4.27
 *           toggle could not express.
 *             contentHint "detail" + BALANCED + medium fps
 *           `balanced` lets libwebrtc trade resolution and frame rate against
 *           each other per-frame instead of sacrificing one wholesale.
 *
 *   MOTION  games, fullscreen video. Smoothness dominates; a soft frame that
 *           arrives on time beats a sharp one that doesn't.
 *             contentHint "motion" + maintain-framerate + full fps
 *
 * ── HOW CONTENT IS MEASURED ────────────────────────────────────────────────
 * Windows Graphics Capture only emits a frame when the captured window's
 * content actually changes, so the arrival rate is a direct measurement of how
 * much is going on — no pixel comparison needed. A game sits at the capture
 * cap, a video in a browser sits near its playback rate, a still document sits
 * at ~0. Where that signal is unavailable (full-screen capture, the
 * getDisplayMedia fallback) we fall back to the encoder's own
 * `framesPerSecond`, which tracks the same thing more coarsely.
 *
 * ── WHY IT DOESN'T FLAP ────────────────────────────────────────────────────
 * A class change must be observed on CONSECUTIVE samples before it is applied,
 * and applying one is rate-limited. Without that, pausing a video or stopping
 * in a game would re-tune the encoder every couple of seconds, and every
 * reconfiguration is a chance for libwebrtc to drop to its software fallback.
 */

export type ScreenContentClass = "static" | "mixed" | "motion";

export interface ScreenContentProfile {
  contentHint: "detail" | "motion";
  degradationPreference: RTCDegradationPreference;
  /** Cap on negotiated frame rate for this class. */
  maxFps: number;
  /**
   * Multiplier on the resolution budget. Static content is cheap per frame, so
   * the same bitrate buys a sharper picture; motion needs the headroom for
   * frame rate instead.
   */
  bitrateScale: number;
}

/** Frames/sec at or above which content counts as full motion. */
export const MOTION_FPS_THRESHOLD = 24;
/** Frames/sec above which content is at least partly animated. */
export const MIXED_FPS_THRESHOLD = 3;
/** Consecutive agreeing samples required before switching class. */
export const CLASS_SWITCH_SAMPLES = 3;
/** Minimum gap between applied class changes. */
export const CLASS_SWITCH_COOLDOWN_MS = 12_000;

export function profileFor(cls: ScreenContentClass, requestedFps: number): ScreenContentProfile {
  switch (cls) {
    case "static":
      return {
        contentHint: "detail",
        degradationPreference: "maintain-resolution",
        // A still page does not need 60 updates a second. Capping here frees
        // the entire bitrate budget for spatial detail.
        maxFps: Math.min(requestedFps, 15),
        bitrateScale: 1,
      };
    case "mixed":
      return {
        contentHint: "detail",
        degradationPreference: "balanced",
        maxFps: Math.min(requestedFps, 30),
        bitrateScale: 1,
      };
    case "motion":
    default:
      return {
        contentHint: "motion",
        degradationPreference: "maintain-framerate",
        maxFps: requestedFps,
        bitrateScale: 1,
      };
  }
}

export function classifyByFps(fps: number): ScreenContentClass {
  if (fps >= MOTION_FPS_THRESHOLD) return "motion";
  if (fps >= MIXED_FPS_THRESHOLD) return "mixed";
  return "static";
}

/**
 * Stateful classifier. Feed it a frame rate every couple of seconds; it returns
 * the class to apply, already debounced and rate-limited.
 */
export function createContentClassifier(initial: ScreenContentClass = "mixed") {
  let current = initial;
  let candidate: ScreenContentClass | null = null;
  let streak = 0;
  let lastSwitchAt = 0;
  let samples = 0;

  return {
    get current() { return current; },
    get sampleCount() { return samples; },
    /**
     * @returns the new class when it changed this sample, otherwise null.
     */
    observe(fps: number, now = Date.now()): ScreenContentClass | null {
      samples++;
      const observed = classifyByFps(fps);
      if (observed === current) { candidate = null; streak = 0; return null; }
      if (observed !== candidate) { candidate = observed; streak = 1; return null; }
      streak++;
      if (streak < CLASS_SWITCH_SAMPLES) return null;
      // Never re-tune the encoder more often than the cooldown, EXCEPT for the
      // very first classification of a share — that one should land promptly so
      // the picture is right within a few seconds of starting.
      const firstDecision = lastSwitchAt === 0;
      if (!firstDecision && now - lastSwitchAt < CLASS_SWITCH_COOLDOWN_MS) return null;
      current = observed;
      candidate = null;
      streak = 0;
      lastSwitchAt = now;
      return current;
    },
  };
}
