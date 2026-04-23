/**
 * iOS PWA / Safari audio playback unlock.
 *
 * On iOS (especially home-screen PWA), freshly-created `<audio>` elements
 * fed a WebRTC `srcObject` will silently refuse to play if the synchronous
 * call stack has already left the user-gesture window — which is ALWAYS the
 * case for an inbound WebRTC call: the SDP/ICE round-trip happens after the
 * "Accept" tap.
 *
 * The browser does NOT throw — `play()` just returns a rejected promise that
 * the rest of the codebase historically swallowed with `.catch(console.error)`.
 * Result: the iOS recipient hears nothing.
 *
 * Fix: wrap every remote-audio element with `armRemoteAudio()`. It:
 *   1. Sets every iOS-friendly attribute up-front (playsinline, muted=false,
 *      autoplay, volume).
 *   2. Calls `play()` immediately.
 *   3. If `play()` rejects (NotAllowedError on iOS), queues the element to be
 *      retried on the very next pointerdown / touchstart / keydown anywhere
 *      in the document. The user's next tap (mute button, slider, even just
 *      tapping the call screen) wakes it up.
 *
 * Used by both VoiceContext (1-on-1) and GroupCallContext (mesh).
 */

const _pendingAudioEls = new Set<HTMLMediaElement>();
let _gestureListenersInstalled = false;

function installGestureListeners() {
  if (_gestureListenersInstalled || typeof window === "undefined") return;
  _gestureListenersInstalled = true;
  const flush = () => {
    if (_pendingAudioEls.size === 0) return;
    const els = Array.from(_pendingAudioEls);
    _pendingAudioEls.clear();
    els.forEach((el) => {
      const p = el.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          console.warn("[iosAudioUnlock] retry play() still failed, requeueing:", err?.name || err);
          // If even the gesture-retry fails, requeue once — this can happen
          // if the gesture target ate the activation (rare).
          _pendingAudioEls.add(el);
        });
      }
    });
  };
  // capture-phase so we beat React handlers
  window.addEventListener("pointerdown", flush, true);
  window.addEventListener("touchstart", flush, true);
  window.addEventListener("keydown", flush, true);
  window.addEventListener("click", flush, true);
}

/**
 * Configure a freshly-created remote audio element for maximum iOS
 * compatibility, then start playback (with gesture-unlock fallback).
 */
export function armRemoteAudio(
  el: HTMLMediaElement,
  opts: { volume?: number; sinkId?: string } = {}
): void {
  try {
    // iOS demands these BEFORE play() — setting them after has no effect.
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    (el as any).playsInline = true;
    el.autoplay = true;
    el.muted = false;
    if (typeof opts.volume === "number") {
      el.volume = Math.max(0, Math.min(1, opts.volume));
    }
    if (opts.sinkId && opts.sinkId !== "default" && (el as any).setSinkId) {
      (el as any).setSinkId(opts.sinkId).catch(() => {});
    }
  } catch {}

  installGestureListeners();

  const tryPlay = () => {
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        const name = err?.name || "";
        // NotAllowedError on iOS means we lost the gesture window.
        // AbortError can happen if srcObject swaps mid-play — also retry.
        if (name === "NotAllowedError" || name === "AbortError" || name === "NotSupportedError") {
          console.warn("[iosAudioUnlock] play() rejected (" + name + ") — will retry on next user gesture");
          _pendingAudioEls.add(el);
        } else {
          console.error("[iosAudioUnlock] play() failed unexpectedly:", err);
          _pendingAudioEls.add(el);
        }
      });
    }
  };

  // Some iOS PWA builds need a microtask delay so the srcObject is fully
  // attached before play() is invoked.
  tryPlay();
  setTimeout(tryPlay, 50);
}
