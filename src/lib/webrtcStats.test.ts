import { describe, expect, it } from "vitest";
import { getSelectedCandidatePair, getRelayHost } from "./webrtcStats";

/** Minimal stand-in for RTCStatsReport (a Map with the same lookup shape). */
const report = (entries: Record<string, any>) =>
  new Map(Object.entries(entries)) as unknown as RTCStatsReport;

const relayLocal = { id: "cL-relay", type: "local-candidate", candidateType: "relay", url: "turn:europe.relay.metered.ca:443?transport=tcp", address: "1.2.3.4" };
const hostRemote = { id: "cR-host", type: "remote-candidate", candidateType: "host", address: "9.9.9.9" };
const hostLocal = { id: "cL-host", type: "local-candidate", candidateType: "host", address: "192.168.1.5" };

describe("getSelectedCandidatePair", () => {
  it("uses the transport's selected pair even when a faster unused pair also succeeded", () => {
    // The exact shape that produced the bug: a relayed call where a direct
    // pair had also reached "succeeded" and was reported instead.
    const stats = report({
      T: { id: "T", type: "transport", selectedCandidatePairId: "P-relay" },
      "P-relay": { id: "P-relay", type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.07, localCandidateId: "cL-relay", remoteCandidateId: "cR-host" },
      "P-direct": { id: "P-direct", type: "candidate-pair", state: "succeeded", nominated: false, currentRoundTripTime: 0.012, localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      "cL-relay": relayLocal,
      "cL-host": hostLocal,
      "cR-host": hostRemote,
    });
    const selected = getSelectedCandidatePair(stats);
    expect(selected?.source).toBe("transport");
    expect(selected?.rttMs).toBe(70);
    expect(selected?.isRelay).toBe(true);
  });

  it("falls back to the `selected` flag when no transport stat exists", () => {
    const stats = report({
      P1: { id: "P1", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.04, localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      P2: { id: "P2", type: "candidate-pair", state: "succeeded", selected: true, currentRoundTripTime: 0.09, localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      "cL-host": hostLocal,
      "cR-host": hostRemote,
    });
    const selected = getSelectedCandidatePair(stats);
    expect(selected?.source).toBe("selected-flag");
    expect(selected?.rttMs).toBe(90);
  });

  it("degrades to the nominated pair rather than returning nothing", () => {
    const stats = report({
      P1: { id: "P1", type: "candidate-pair", state: "succeeded", nominated: false, currentRoundTripTime: 0.04, localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      P2: { id: "P2", type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.06, localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      "cL-host": hostLocal,
      "cR-host": hostRemote,
    });
    const selected = getSelectedCandidatePair(stats);
    expect(selected?.source).toBe("heuristic");
    expect(selected?.rttMs).toBe(60);
  });

  it("returns null when no pair has been selected yet", () => {
    expect(getSelectedCandidatePair(report({}))).toBeNull();
  });

  it("reports a null rtt rather than 0 when the pair has not measured one", () => {
    const stats = report({
      T: { id: "T", type: "transport", selectedCandidatePairId: "P" },
      P: { id: "P", type: "candidate-pair", state: "succeeded", localCandidateId: "cL-host", remoteCandidateId: "cR-host" },
      "cL-host": hostLocal,
      "cR-host": hostRemote,
    });
    expect(getSelectedCandidatePair(stats)?.rttMs).toBeNull();
  });
});

describe("getRelayHost", () => {
  const withPair = (local: any, remote: any) =>
    getSelectedCandidatePair(report({
      T: { id: "T", type: "transport", selectedCandidatePairId: "P" },
      P: { id: "P", type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.07, localCandidateId: local.id, remoteCandidateId: remote.id },
      [local.id]: local,
      [remote.id]: remote,
    }));

  it("derives the host from the local relay candidate's ICE server url", () => {
    expect(getRelayHost(withPair(relayLocal, hostRemote))).toBe("europe.relay.metered.ca:443");
  });

  it("uses the peer's relay address when only the far end is relayed", () => {
    const relayRemote = { id: "cR-relay", type: "remote-candidate", candidateType: "relay", address: "5.6.7.8" };
    expect(getRelayHost(withPair(hostLocal, relayRemote))).toBe("5.6.7.8");
  });

  it("returns null for a direct peer-to-peer pair", () => {
    expect(getRelayHost(withPair(hostLocal, hostRemote))).toBeNull();
    expect(getRelayHost(null)).toBeNull();
  });
});
