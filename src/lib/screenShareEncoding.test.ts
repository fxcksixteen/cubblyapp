import { describe, expect, it } from "vitest";
import { nextScreenBitrate } from "./screenShareEncoding";

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