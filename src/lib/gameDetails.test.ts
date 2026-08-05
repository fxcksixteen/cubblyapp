import { describe, expect, it } from "vitest";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { lastIndexOfAny, valorantMapName } = require("../../electron/gameDetails.cjs");

describe("lastIndexOfAny — marker ordering decides current state", () => {
  it("finds the last occurrence across several patterns", () => {
    const log = "loaded map Ascent\nsome noise\nReturning to main menu\n";
    const entered = lastIndexOfAny(log, [/loaded map/i]);
    const left = lastIndexOfAny(log, [/Returning to (?:the )?(?:main )?menu/i]);
    expect(left).toBeGreaterThan(entered); // player is in the menu NOW
  });

  it("reports in-match when the map load came last", () => {
    const log = "Returning to main menu\nlater: loaded map Ascent\n";
    const entered = lastIndexOfAny(log, [/loaded map/i]);
    const left = lastIndexOfAny(log, [/Returning to (?:the )?(?:main )?menu/i]);
    expect(entered).toBeGreaterThan(left);
  });

  it("returns -1 when nothing matches", () => {
    expect(lastIndexOfAny("nothing here", [/absent/i])).toBe(-1);
  });

  it("does not hang on zero-length matches", () => {
    expect(() => lastIndexOfAny("aaa", [/a*/g])).not.toThrow();
  });
});

describe("valorantMapName — codenames are meaningless to players", () => {
  it("translates internal codenames to the names people know", () => {
    expect(valorantMapName("Duality")).toBe("Bind");
    expect(valorantMapName("Triad")).toBe("Haven");
    expect(valorantMapName("Bonsai")).toBe("Split");
    expect(valorantMapName("Port")).toBe("Icebox");
  });

  it("is case-insensitive", () => {
    expect(valorantMapName("duality")).toBe("Bind");
  });

  it("passes through an unknown map rather than dropping it", () => {
    expect(valorantMapName("SomeNewMap")).toBe("SomeNewMap");
  });

  it("handles null", () => {
    expect(valorantMapName(null)).toBeNull();
  });
});
