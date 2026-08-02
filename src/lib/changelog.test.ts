import { describe, expect, it } from "vitest";
import { CHANGELOG, CURRENT_VERSION, getChangelogEntry } from "./changelog";

describe("changelog", () => {
  it("has a real entry for CURRENT_VERSION (not the CHANGELOG[0] fallback)", () => {
    // WhatsNewModal does `getChangelogEntry(CURRENT_VERSION) ?? CHANGELOG[0]`,
    // so a missing entry silently shows the PREVIOUS release's notes instead
    // of failing. This asserts the lookup actually resolves.
    const entry = getChangelogEntry(CURRENT_VERSION);
    expect(entry, `no CHANGELOG entry for CURRENT_VERSION ${CURRENT_VERSION}`).toBeDefined();
    expect(entry!.version).toBe(CURRENT_VERSION);
  });

  it("lists the newest release first", () => {
    expect(CHANGELOG[0].version).toBe(CURRENT_VERSION);
  });

  it("gives every entry a date, hero and at least one note", () => {
    for (const e of CHANGELOG) {
      expect(e.date, `${e.version} missing date`).toBeTruthy();
      expect(e.hero, `${e.version} missing hero`).toBeTruthy();
      expect(
        e.newFeatures.length + e.bugFixes.length,
        `${e.version} has no notes`,
      ).toBeGreaterThan(0);
    }
  });

  it("has no duplicate versions", () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });
});
