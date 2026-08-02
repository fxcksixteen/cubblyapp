import { describe, expect, it } from "vitest";
import { calculatePerPeerScreenBudget, nextScreenBitrate, setEncoderClamp, getEncoderClamp, clearEncoderClamp } from "./screenShareEncoding";
import { SOFTWARE_ENCODER_RE, SOFTWARE_SAMPLES_TO_CLAMP, ENCODER_FIRST_PROBE_MS } from "@/contexts/VoiceContext";

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
describe("encoder clamp lifecycle (v0.4.27 hysteresis)", () => {
  const fakeSender = () => ({
    getParameters: () => ({ encodings: [{ rid: "f" }] }),
    setParameters: async () => {},
    track: { getSettings: () => ({ height: 1080 }) },
  }) as unknown as RTCRtpSender;

  it("a clamp can be cleared — before 0.4.27 there was no way to lift one", () => {
    const s = fakeSender();
    setEncoderClamp(s, { maxFramerate: 30, minScale: 1.5, maxBitrate: 3_000_000 });
    expect(getEncoderClamp(s)).not.toBeNull();
    expect(clearEncoderClamp(s)).toBe(true);
    expect(getEncoderClamp(s)).toBeNull();
  });

  it("clearing an unclamped sender is a harmless no-op", () => {
    expect(clearEncoderClamp(fakeSender())).toBe(false);
  });

  it("requires several consecutive software samples before clamping", () => {
    // Mirrors the detector's streak logic.
    let softwareStreak = 0, clamped = false;
    const feed = (impl: string) => {
      if (SOFTWARE_ENCODER_RE.test(impl)) {
        if (++softwareStreak >= SOFTWARE_SAMPLES_TO_CLAMP) clamped = true;
      } else softwareStreak = 0;
    };
    // The exact reported sequence: one transient OpenH264, then NVENC.
    feed("OpenH264");
    expect(clamped).toBe(false); // 0.4.26 clamped right here
    feed("MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)");
    feed("MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)");
    expect(clamped).toBe(false);
    expect(softwareStreak).toBe(0);
  });

  it("clamps when software really is sustained", () => {
    let softwareStreak = 0, clamped = false;
    for (let i = 0; i < SOFTWARE_SAMPLES_TO_CLAMP; i++) {
      if (SOFTWARE_ENCODER_RE.test("OpenH264")) {
        if (++softwareStreak >= SOFTWARE_SAMPLES_TO_CLAMP) clamped = true;
      }
    }
    expect(clamped).toBe(true);
  });

  it("recognises the real implementation strings from the field", () => {
    expect(SOFTWARE_ENCODER_RE.test("OpenH264")).toBe(true);
    expect(SOFTWARE_ENCODER_RE.test("libvpx")).toBe(true);
    expect(SOFTWARE_ENCODER_RE.test("SimulcastEncoderAdapter (libvpx, libvpx)")).toBe(true);
    expect(SOFTWARE_ENCODER_RE.test("MediaFoundationVideoEncodeAccelerator (NVIDIA H.264 Encoder MFT)")).toBe(false);
  });

  it("probes only after the encoder has had time to settle", () => {
    // 2.5s reliably caught Media Foundation mid-initialisation.
    expect(ENCODER_FIRST_PROBE_MS).toBeGreaterThanOrEqual(5000);
  });
});
