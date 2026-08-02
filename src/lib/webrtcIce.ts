export const STUN_FALLBACK_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

const urlsFor = (server: RTCIceServer): string[] => {
  const urls = server.urls;
  if (!urls) return [];
  return Array.isArray(urls) ? urls : [urls];
};

const isTurnServer = (server: RTCIceServer) =>
  urlsFor(server).some((url) => /^turns?:/i.test(url));

export const hasTurnServers = (servers: RTCIceServer[]) => servers.some(isTurnServer);

export const withoutTurnServers = (servers: RTCIceServer[]) => {
  const filtered = servers.filter((server) => !isTurnServer(server));
  return filtered.length > 0 ? filtered : STUN_FALLBACK_SERVERS;
};

/**
 * v0.4.27 — 4s, was 1600ms.
 *
 * A TURN allocation is DNS + Allocate -> 401 challenge -> authenticated
 * Allocate: two round trips minimum, plus a TLS handshake for turns:443.
 * Against a relay a continent away that routinely exceeds 1600ms, and the
 * timeout was treated as "TURN is broken" — stripping relay servers for the
 * WHOLE session. A call that then lost its direct path had nothing to fall
 * back to and went connected -> disconnected -> failed.
 */
export const RELAY_PROBE_TIMEOUT_MS = 4000;

export async function relayCandidateAppears(servers: RTCIceServer[], timeoutMs = RELAY_PROBE_TIMEOUT_MS): Promise<boolean> {
  if (typeof RTCPeerConnection === "undefined" || !hasTurnServers(servers)) return false;
  let pc: RTCPeerConnection | null = null;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      try { pc?.close(); } catch {}
      resolve(ok);
    };

    try {
      pc = new RTCPeerConnection({ iceServers: servers.filter(isTurnServer), iceTransportPolicy: "relay" });
      pc.createDataChannel("turn-health");
      pc.onicecandidate = (event) => {
        const candidate = event.candidate;
        if (!candidate) return;
        if (candidate.type === "relay" || / typ relay /i.test(candidate.candidate || "")) {
          finish(true);
        }
      };
      pc.createOffer()
        .then((offer) => pc?.setLocalDescription(offer))
        .catch(() => finish(false));
      window.setTimeout(() => finish(false), timeoutMs);
    } catch {
      finish(false);
    }
  });
}

let warnedTurnFallbackThisSession = false;

export async function sanitizeIceServersForSession(servers: RTCIceServer[] | null | undefined): Promise<RTCIceServer[]> {
  const next = Array.isArray(servers) && servers.length > 0 ? servers : STUN_FALLBACK_SERVERS;
  if (!hasTurnServers(next)) return next;

  // One retry — the first probe often races DNS resolution of the relay host.
  let relayOk = await relayCandidateAppears(next);
  if (!relayOk) relayOk = await relayCandidateAppears(next);
  if (relayOk) return next;

  // v0.4.27 — KEEP the TURN servers even when the probe times out. A slow relay
  // is still a working fallback; dropping it left the session with no path at
  // all once the direct one degraded. ICE itself is perfectly capable of
  // ignoring a relay that never produces candidates.
  if (!warnedTurnFallbackThisSession) {
    warnedTurnFallbackThisSession = true;
    console.warn(
      "[WebRTC] TURN relay was slow to produce candidates; keeping relay servers " +
      "configured anyway so ICE retains a fallback path"
    );
  }
  return next;
}
