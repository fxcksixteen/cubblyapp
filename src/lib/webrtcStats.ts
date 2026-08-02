/**
 * Shared helper for reading the ICE candidate pair that is ACTUALLY carrying
 * media, plus the relay it goes through when the connection is relayed.
 *
 * WHY THIS EXISTS (v0.4.26):
 * The ping poll and the diagnostics snapshot each used to scan every
 * `candidate-pair` report with `state === "succeeded"` and guess which one was
 * live, preferring non-relay pairs. Chromium keeps non-selected pairs — and
 * pairs left over from earlier ICE restarts — in getStats() with that same
 * "succeeded" state, so on a genuinely relayed call where any direct pair had
 * also completed its checks, the UI reported the direct pair's optimistic RTT
 * while audio was really flowing over the relay.
 *
 * `RTCTransportStats.selectedCandidatePairId` is the authoritative pointer to
 * the pair in use. We resolve through that first and only fall back to the old
 * heuristic when an implementation doesn't provide it, so a browser without
 * that field still shows *a* number instead of none.
 *
 * NOTE ON WHAT THE RTT MEANS: Cubbly calls are peer-to-peer, so
 * `currentRoundTripTime` is the round trip between the two peers along this
 * pair's path — including both relay legs when relayed. It is symmetric by
 * construction: both ends measure the same path and both see the same value.
 * There is no per-user "distance to region" in a P2P topology.
 */

export interface SelectedCandidatePair {
  /** The RTCIceCandidatePairStats report actually in use. */
  pair: any;
  local: any | null;
  remote: any | null;
  /** True when either end of the selected pair is a TURN relay candidate. */
  isRelay: boolean;
  /** Round trip time in ms, or null when the pair hasn't measured one yet. */
  rttMs: number | null;
  /** How the pair was resolved — "transport" is authoritative. */
  source: "transport" | "selected-flag" | "heuristic";
}

function toRttMs(pair: any): number | null {
  return typeof pair?.currentRoundTripTime === "number"
    ? Math.round(pair.currentRoundTripTime * 1000)
    : null;
}

function build(stats: RTCStatsReport, pair: any, source: SelectedCandidatePair["source"]): SelectedCandidatePair {
  const local = (pair?.localCandidateId ? stats.get(pair.localCandidateId) : null) as any || null;
  const remote = (pair?.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null) as any || null;
  return {
    pair,
    local,
    remote,
    isRelay: local?.candidateType === "relay" || remote?.candidateType === "relay",
    rttMs: toRttMs(pair),
    source,
  };
}

/**
 * Resolve the candidate pair currently carrying media, or null when the
 * connection has not selected one yet.
 */
export function getSelectedCandidatePair(stats: RTCStatsReport): SelectedCandidatePair | null {
  // 1. Authoritative: transport -> selectedCandidatePairId.
  let selectedId: string | null = null;
  stats.forEach((r: any) => {
    if (selectedId) return;
    if (r?.type === "transport" && typeof r.selectedCandidatePairId === "string") {
      selectedId = r.selectedCandidatePairId;
    }
  });
  if (selectedId) {
    const pair = stats.get(selectedId) as any;
    if (pair) return build(stats, pair, "transport");
  }

  // 2. Some implementations flag the pair directly instead.
  let flagged: any = null;
  stats.forEach((r: any) => {
    if (flagged) return;
    if (r?.type === "candidate-pair" && r.selected === true) flagged = r;
  });
  if (flagged) return build(stats, flagged, "selected-flag");

  // 3. Last resort — the old heuristic, so we degrade to a number rather than
  //    to nothing. Nominated wins; among equals prefer one that has an RTT.
  let best: any = null;
  let bestRank = -1;
  stats.forEach((r: any) => {
    if (r?.type !== "candidate-pair" || r.state !== "succeeded") return;
    const rank = (r.nominated ? 2 : 0) + (typeof r.currentRoundTripTime === "number" ? 1 : 0);
    if (rank > bestRank) { bestRank = rank; best = r; }
  });
  return best ? build(stats, best, "heuristic") : null;
}

/**
 * Human-readable host of the TURN relay actually in use, or null when the
 * connection isn't relayed / the relay can't be identified.
 *
 * Previously the diagnostics modal derived this from the FIRST TURN server in
 * our own configured list, which is always the locally preferred region — even
 * when ICE selected the *peer's* relay in a different region. The local
 * candidate's `url` is the ICE server that actually produced the candidate.
 */
export function getRelayHost(selected: SelectedCandidatePair | null): string | null {
  if (!selected?.isRelay) return null;
  const { local, remote } = selected;
  if (local?.candidateType === "relay") {
    const url: string | undefined = local.url;
    if (typeof url === "string" && url) {
      return url.replace(/^turns?:/i, "").split("?")[0];
    }
    if (local.address) return String(local.address);
  }
  // Only the far end is relayed: the peer allocated it on their own TURN
  // server, so we have no URL for it — the address is the relay endpoint we
  // are actually sending to.
  if (remote?.candidateType === "relay" && remote.address) return String(remote.address);
  return null;
}
