import { describe, expect, it } from "vitest";
import {
  shouldResyncNativeAudio,
  driftCorrectedRate,
  MAX_RATE_CORRECTION,
  RATE_DEADBAND_SECONDS,
  NATIVE_AUDIO_TARGET_LEAD_SECONDS,
  NATIVE_AUDIO_MAX_LEAD_SECONDS,
} from "./nativeWindowAudio";

describe("native window audio resync", () => {
  it("resyncs when scheduled audio gets too far ahead", () => {
    expect(shouldResyncNativeAudio(10.4, 10)).toBe(true);
  });

  it("drops PCM captured before a renderer stall", () => {
    expect(shouldResyncNativeAudio(10.05, 10, 1_000, 1_400)).toBe(true);
  });

  it("keeps a short live buffer", () => {
    expect(shouldResyncNativeAudio(10.05, 10, 1_000, 1_050)).toBe(false);
  });
});
describe("drift compensation (v0.4.28)", () => {
  it("leaves the rate alone when the lead is on target", () => {
    expect(driftCorrectedRate(NATIVE_AUDIO_TARGET_LEAD_SECONDS)).toBe(1);
  });

  it("ignores tiny errors rather than chasing them", () => {
    expect(driftCorrectedRate(NATIVE_AUDIO_TARGET_LEAD_SECONDS + RATE_DEADBAND_SECONDS / 2)).toBe(1);
  });

  it("plays slightly FASTER to burn off an accumulated lead", () => {
    // This is the drift direction that used to grow until the hard resync.
    const rate = driftCorrectedRate(NATIVE_AUDIO_TARGET_LEAD_SECONDS + 0.05);
    expect(rate).toBeGreaterThan(1);
  });

  it("plays slightly SLOWER to let playback catch up to a deficit", () => {
    const rate = driftCorrectedRate(NATIVE_AUDIO_TARGET_LEAD_SECONDS - 0.05);
    expect(rate).toBeLessThan(1);
  });

  it("never corrects hard enough to be audible", () => {
    // A semitone is ~5.9%. Anything under ~1% is inaudible on speech/game audio.
    for (const lead of [0, 0.5, 5, -5, 100]) {
      const rate = driftCorrectedRate(lead);
      // +epsilon: 1 + 0.005 is not exactly representable in binary floating
      // point, so the round-trip through the addition lands a few ulps over.
      expect(Math.abs(rate - 1)).toBeLessThanOrEqual(MAX_RATE_CORRECTION + 1e-9);
    }
    expect(MAX_RATE_CORRECTION).toBeLessThan(0.01);
  });

  it("converges: repeated correction walks a real drift back to the target", () => {
    // Simulate a capture clock running 0.3% fast against the context clock.
    let lead = NATIVE_AUDIO_TARGET_LEAD_SECONDS;
    const blockDuration = 0.01; // 10ms blocks
    for (let i = 0; i < 4000; i++) {
      const rate = driftCorrectedRate(lead);
      lead += blockDuration / rate - blockDuration * 0.997;
    }
    // Without correction this diverges without bound; with it the lead stays
    // bounded near the target instead of climbing to the resync ceiling.
    expect(lead).toBeLessThan(NATIVE_AUDIO_MAX_LEAD_SECONDS);
  });
});
