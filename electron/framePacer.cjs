/**
 * Accumulator-based frame pacer for native window capture.
 *
 * WHY NOT A STRICT INTERVAL GATE:
 * The obvious `if (now - lastEmitted >= interval)` test aliases badly against
 * a source whose cadence is close to a multiple of the target. Measured: a
 * 59.7fps source paced to 30fps delivered only 23.4fps, because per-frame
 * jitter repeatedly pushed the delta just under the threshold, costing a whole
 * extra source frame (33ms -> 50ms period) each time it happened.
 *
 * This paces against a fixed schedule instead: `nextDueUs` advances by exactly
 * one interval per emitted frame and never re-anchors to actual arrival times,
 * so jitter averages out and the long-run rate equals the target whenever the
 * source is at least as fast. The half-source-period tolerance keeps an exact
 * 2:1 ratio from degenerating into 4:1 on floating-point ties.
 *
 * Paced on the native FrameArrived timestamp (`captureTimeUs`), not on
 * delivery time — that clock has far less jitter, and it's the one that
 * reflects when the pixels actually existed.
 */

function createFramePacer(targetFps) {
  let nextDueUs = 0;
  let lastTsUs = 0;
  let srcPeriodUs = 0;
  let emitted = 0;
  let dropped = 0;

  const uncapped = !(targetFps > 0);
  const intervalUs = uncapped ? 0 : 1e6 / targetFps;

  return {
    /** @param {number} tsUs epoch microseconds from the native capture stamp */
    shouldEmit(tsUs) {
      if (uncapped) { emitted++; return true; }
      if (!Number.isFinite(tsUs) || tsUs <= 0) { emitted++; return true; }

      // EMA of the source's inter-frame period, used for the tie tolerance.
      if (lastTsUs > 0) {
        const d = tsUs - lastTsUs;
        if (d > 0 && d < 1e6) srcPeriodUs = srcPeriodUs ? srcPeriodUs * 0.9 + d * 0.1 : d;
      }
      lastTsUs = tsUs;

      if (nextDueUs === 0) {
        nextDueUs = tsUs + intervalUs;
        emitted++;
        return true;
      }

      const tol = srcPeriodUs ? srcPeriodUs / 2 : 0;
      if (tsUs + tol >= nextDueUs) {
        nextDueUs += intervalUs;
        // Re-anchor only after a real stall (window minimized, source paused),
        // so we don't burst-emit to "catch up" on resume.
        if (nextDueUs <= tsUs) nextDueUs = tsUs + intervalUs;
        emitted++;
        return true;
      }

      dropped++;
      return false;
    },
    stats() { return { emitted, dropped, targetFps: uncapped ? 0 : targetFps }; },
  };
}

module.exports = { createFramePacer };
