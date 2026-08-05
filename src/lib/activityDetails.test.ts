import { describe, expect, it } from "vitest";
import { detailsMatchActivity } from "@/contexts/ActivityContext";

/**
 * Regression guard for the "In match for everything" bug.
 *
 * activity_details rows are keyed (user_id, game_key) but the lookup map is
 * keyed by user alone, so a leftover row from the previous game would render
 * under whatever the user is doing now.
 */
describe("detailsMatchActivity", () => {
  it("matches a row to the game it came from", () => {
    expect(detailsMatchActivity("valorant", "VALORANT")).toBe(true);
    expect(detailsMatchActivity("fortnite", "Fortnite")).toBe(true);
    expect(detailsMatchActivity("roblox", "Roblox")).toBe(true);
    expect(detailsMatchActivity("lol", "League of Legends")).toBe(true);
    expect(detailsMatchActivity("marvel-rivals", "Marvel Rivals")).toBe(true);
  });

  it("does NOT attach a stale row to an unrelated app — the reported bug", () => {
    // Valorant session ends, user opens Steam, old row still in the table.
    expect(detailsMatchActivity("valorant", "Steam")).toBe(false);
    expect(detailsMatchActivity("fortnite", "Discord")).toBe(false);
    expect(detailsMatchActivity("roblox", "Google Chrome")).toBe(false);
    expect(detailsMatchActivity("lol", "Visual Studio Code")).toBe(false);
  });

  it("fails closed on an unknown game_key rather than guessing", () => {
    expect(detailsMatchActivity("some-new-game", "Some New Game")).toBe(false);
  });

  it("handles missing inputs", () => {
    expect(detailsMatchActivity(null, "Steam")).toBe(false);
    expect(detailsMatchActivity("valorant", null)).toBe(false);
    expect(detailsMatchActivity(undefined, undefined)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(detailsMatchActivity("VALORANT", "valorant")).toBe(true);
  });
});
