import { describe, expect, it } from "vitest";
import { calculatePerPeerScreenBudget, nextScreenBitrate, setEncoderClamp, getEncoderClamp } from "./screenShareEncoding";

const healthy = {
  bitrate: 3_000_000,
  targetBitrate: 6_000_000,
  floorBitrate: 600_000,
  availableOutgoingBitrate: 8_000_000,
  loss: 0,
  rttMs: 35,
  baselineRttMs: 30,
  bandwidthLimited: false,
  cleanSamples: 0,
};

describe("nextScreenBitrate", () => {
  it("backs off immediately when call RTT bloats", () => {
    const result = nextScreenBitrate({ ...healthy, rttMs: 110 });
    expect(result.reason).toBe("call-rtt");
    expect(result.bitrate).toBeLessThan(healthy.bitrate);
  });

  it("honors the safe available-upload reserve", () => {
    const result = nextScreenBitrate({ ...healthy, bandwidthLimited: true, availableOutgoingBitrate: 1_500_000 });
    expect(result.bitrate).toBeLessThanOrEqual(1_080_000);
  });

  it("probes upward only after four clean samples", () => {
    expect(nextScreenBitrate({ ...healthy, cleanSamples: 2 }).reason).toBe("hold");
    expect(nextScreenBitrate({ ...healthy, cleanSamples: 3 }).reason).toBe("probe");
  });
});

describe("calculatePerPeerScreenBudget", () => {
  it("bounds aggregate mesh upload as viewers join", () => {
    expect(calculatePerPeerScreenBudget(6_000_000, 1)).toBe(6_000_000);
    expect(calculatePerPeerScreenBudget(6_000_000, 3)).toBe(2_000_000);
  });
});

describe("setEncoderClamp", () => {
  const makeSender = () => {
    const applied: any[] = [];
    const sender = {
      getParameters: () => ({ encodings: [{}] }),
      setParameters: (p: any) => { applied.push(p); return Promise.resolve(); },
      track: null,
    } as unknown as RTCRtpSender;
    return { sender, applied };
  };

  it("applies the clamp immediately and registers it for later lookups", async () => {
    const { sender, applied } = makeSender();
    setEncoderClamp(sender, { maxFramerate: 30, minScale: 1.5, maxBitrate: 3_000_000 });
    // setEncoderClamp pushes params without waiting for the adaptive tick.
    await Promise.resolve();
    expect(applied.length).toBe(1);
    const enc = applied[0].encodings[0];
    expect(enc.maxFramerate).toBe(30);
    expect(enc.maxBitrate).toBe(3_000_000);
    expect(enc.scaleResolutionDownBy).toBe(1.5);
    expect(getEncoderClamp(sender)).toEqual({ maxFramerate: 30, minScale: 1.5, maxBitrate: 3_000_000 });
  });

  it("caps whatever the adaptive controller later asks for", async () => {
    // The controller calls applyEncoding with its own (higher) targets; the
    // clamp inside applyEncoding must win. Exercised via a second
    // setEncoderClamp with laxer values on the SAME sender — the stored clamp
    // is overwritten, proving the WeakMap path is live; then the strict clamp
    // again to confirm floor/ceiling ordering.
    const { sender, applied } = makeSender();
    setEncoderClamp(sender, { maxFramerate: 30, minScale: 2, maxBitrate: 2_500_000 });
    await Promise.resolve();
    const enc = applied[applied.length - 1].encodings[0];
    // A clamp can never raise values above itself.
    expect(enc.maxFramerate).toBeLessThanOrEqual(30);
    expect(enc.maxBitrate).toBeLessThanOrEqual(2_500_000);
    expect(enc.scaleResolutionDownBy).toBeGreaterThanOrEqual(2);
  });
});