import { describe, expect, it } from "vitest";

/**
 * The politeness rule used by the DM offer-glare tie-break.
 * Mirrors VoiceContext: the LOWER user id yields (rolls back and accepts).
 * Both peers must compute the same answer from the same two ids with no extra
 * signalling — that is the whole point.
 */
const isPolite = (selfId: string, peerId: string) => selfId < peerId;

describe("offer-glare politeness", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";

  it("assigns exactly one polite peer — never both, never neither", () => {
    expect(isPolite(A, B)).toBe(true);
    expect(isPolite(B, A)).toBe(false);
    expect(isPolite(A, B)).not.toBe(isPolite(B, A));
  });

  it("both sides agree on who yields without exchanging anything", () => {
    // Each peer only knows (self, peer) — they must still reach one verdict.
    const aThinks = isPolite(A, B);   // A: I yield
    const bThinks = isPolite(B, A);   // B: I hold
    expect(aThinks && !bThinks).toBe(true);
  });

  it("is stable regardless of which side evaluates first", () => {
    for (let i = 0; i < 50; i++) {
      expect(isPolite(A, B)).toBe(true);
      expect(isPolite(B, A)).toBe(false);
    }
  });

  it("is deterministic for arbitrary id pairs", () => {
    const ids = ["a", "b", "zz", "0", "ffffffff", "00000000"];
    for (const x of ids) for (const y of ids) {
      if (x === y) continue;
      expect(isPolite(x, y)).toBe(!isPolite(y, x));
    }
  });
});
