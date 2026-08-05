import { describe, expect, it } from "vitest";
import {
  profileFor, classifyByFps, createContentClassifier,
  MOTION_FPS_THRESHOLD, MIXED_FPS_THRESHOLD,
  CLASS_SWITCH_SAMPLES, CLASS_SWITCH_COOLDOWN_MS,
} from "./screenContentMode";

describe("classifyByFps", () => {
  it("a game at the capture cap is motion", () => {
    expect(classifyByFps(60)).toBe("motion");
    expect(classifyByFps(MOTION_FPS_THRESHOLD)).toBe("motion");
  });

  it("a browser playing video is mixed, not motion and not static", () => {
    // A 24-30fps video in a window updates steadily but not at game rates.
    expect(classifyByFps(12)).toBe("mixed");
    expect(classifyByFps(MIXED_FPS_THRESHOLD)).toBe("mixed");
  });

  it("a still document is static — WGC emits ~nothing when nothing changes", () => {
    expect(classifyByFps(0)).toBe("static");
    expect(classifyByFps(1)).toBe("static");
  });
});

describe("profileFor", () => {
  it("static spends everything on sharpness", () => {
    const p = profileFor("static", 60);
    expect(p.contentHint).toBe("detail");
    expect(p.degradationPreference).toBe("maintain-resolution");
    expect(p.maxFps).toBeLessThanOrEqual(15);
  });

  it("mixed uses balanced — the case a two-way toggle could not express", () => {
    const p = profileFor("mixed", 60);
    expect(p.degradationPreference).toBe("balanced");
    expect(p.contentHint).toBe("detail"); // text in the window must stay readable
  });

  it("motion keeps the user's full frame rate", () => {
    const p = profileFor("motion", 60);
    expect(p.contentHint).toBe("motion");
    expect(p.degradationPreference).toBe("maintain-framerate");
    expect(p.maxFps).toBe(60);
  });

  it("never raises fps above what was requested", () => {
    expect(profileFor("motion", 24).maxFps).toBe(24);
    expect(profileFor("mixed", 10).maxFps).toBe(10);
    expect(profileFor("static", 10).maxFps).toBe(10);
  });

  it("all three classes are distinct configurations", () => {
    const prefs = (["static", "mixed", "motion"] as const).map((c) => profileFor(c, 60).degradationPreference);
    expect(new Set(prefs).size).toBe(3);
  });
});

describe("createContentClassifier", () => {
  it("does not switch on a single divergent sample", () => {
    const c = createContentClassifier("motion");
    expect(c.observe(0)).toBeNull(); // one still frame in a game means nothing
    expect(c.current).toBe("motion");
  });

  it("switches after consecutive agreeing samples", () => {
    const c = createContentClassifier("motion");
    let changed: string | null = null;
    for (let i = 0; i < CLASS_SWITCH_SAMPLES; i++) changed = c.observe(0);
    expect(changed).toBe("static");
    expect(c.current).toBe("static");
  });

  it("a broken streak resets — alt-tabbing mid-game must not retune", () => {
    const c = createContentClassifier("motion");
    c.observe(0);
    c.observe(0);
    c.observe(60);           // back to motion, streak dies
    expect(c.observe(0)).toBeNull();
    expect(c.current).toBe("motion");
  });

  it("rate-limits switching after the first decision", () => {
    const c = createContentClassifier("motion");
    let t = 1_000_000;
    // First decision lands immediately so the share is tuned right away.
    for (let i = 0; i < CLASS_SWITCH_SAMPLES; i++) c.observe(0, t);
    expect(c.current).toBe("static");
    // An immediate flip back is suppressed by the cooldown.
    for (let i = 0; i < CLASS_SWITCH_SAMPLES; i++) c.observe(60, t + 1000);
    expect(c.current).toBe("static");
    // Once the cooldown has passed it is allowed.
    for (let i = 0; i < CLASS_SWITCH_SAMPLES; i++) c.observe(60, t + CLASS_SWITCH_COOLDOWN_MS + 1);
    expect(c.current).toBe("motion");
  });

  it("settles the first classification promptly", () => {
    const c = createContentClassifier("mixed");
    let changed: string | null = null;
    for (let i = 0; i < CLASS_SWITCH_SAMPLES; i++) changed = c.observe(60, 5_000);
    expect(changed).toBe("motion"); // no cooldown wait on the first decision
  });
});
