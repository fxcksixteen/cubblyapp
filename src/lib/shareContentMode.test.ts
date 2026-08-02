import { describe, expect, it, beforeEach } from "vitest";
import {
  profileForMode, modeFromCaptureRate, modeFromSourceKind,
  getStoredShareMode, setStoredShareMode, shareModeKey,
  MOTION_FPS_THRESHOLD, DETAIL_MODE_FPS_CAP,
} from "./shareContentMode";

describe("profileForMode", () => {
  it("keeps games smooth: motion drops resolution, never frame rate", () => {
    const p = profileForMode("motion", 60);
    expect(p.contentHint).toBe("motion");
    expect(p.degradationPreference).toBe("maintain-framerate");
    expect(p.maxFps).toBe(60); // a shooter keeps the user's fps
  });

  it("keeps text sharp: detail drops frame rate, never resolution", () => {
    const p = profileForMode("detail", 60);
    expect(p.contentHint).toBe("detail");
    expect(p.degradationPreference).toBe("maintain-resolution");
    expect(p.maxFps).toBe(DETAIL_MODE_FPS_CAP); // 60fps on a still page is wasted bitrate
  });

  it("never raises the user's fps above what they asked for", () => {
    expect(profileForMode("motion", 24).maxFps).toBe(24);
    expect(profileForMode("detail", 15).maxFps).toBe(15);
  });

  it("picks opposite degradation preferences — the whole point", () => {
    expect(profileForMode("motion", 60).degradationPreference)
      .not.toBe(profileForMode("detail", 60).degradationPreference);
  });
});

describe("modeFromCaptureRate", () => {
  it("treats a game's capture rate as motion", () => {
    expect(modeFromCaptureRate(60)).toBe("motion");
    expect(modeFromCaptureRate(30)).toBe("motion");
    expect(modeFromCaptureRate(MOTION_FPS_THRESHOLD)).toBe("motion");
  });

  it("treats a still document as detail — WGC emits ~nothing when nothing changes", () => {
    expect(modeFromCaptureRate(0)).toBe("detail");
    expect(modeFromCaptureRate(0.5)).toBe("detail");
    expect(modeFromCaptureRate(MOTION_FPS_THRESHOLD - 0.1)).toBe("detail");
  });
});

describe("modeFromSourceKind (no native measurement available)", () => {
  it("treats a whole monitor as motion", () => {
    expect(modeFromSourceKind("screen:0:0")).toBe("motion");
  });
  it("treats an unknown window as detail", () => {
    expect(modeFromSourceKind("window:12345:0")).toBe("detail");
  });
  it("treats a known game window as motion even without measurement", () => {
    expect(modeFromSourceKind("window:12345:0", true)).toBe("motion");
  });
});

describe("per-source persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to auto for a source never chosen before", () => {
    expect(getStoredShareMode("Some Game")).toBe("auto");
  });

  it("remembers an explicit choice across shares", () => {
    setStoredShareMode("Adobe Reader - report.pdf", "detail");
    expect(getStoredShareMode("Adobe Reader - report.pdf")).toBe("detail");
  });

  it("keys on the window NAME, not the volatile HWND, and is case-insensitive", () => {
    setStoredShareMode("VALORANT", "motion");
    expect(getStoredShareMode("valorant")).toBe("motion");
    expect(shareModeKey("  VALORANT  ")).toBe("valorant");
  });

  it("clearing back to auto forgets the override", () => {
    setStoredShareMode("Notepad", "detail");
    setStoredShareMode("Notepad", "auto");
    expect(getStoredShareMode("Notepad")).toBe("auto");
  });

  it("survives corrupt storage", () => {
    localStorage.setItem("cubbly-share-content-mode", "{not json");
    expect(getStoredShareMode("anything")).toBe("auto");
  });
});
