import { describe, expect, it } from "vitest";
import { shouldResyncNativeAudio } from "./nativeWindowAudio";

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