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

export async function relayCandidateAppears(servers: RTCIceServer[], timeoutMs = 1600): Promise<boolean> {
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

  const relayOk = await relayCandidateAppears(next);
  if (relayOk) return next;

  if (!warnedTurnFallbackThisSession) {
    warnedTurnFallbackThisSession = true;
    console.warn("[WebRTC] TURN relay did not produce candidates quickly; using direct/STUN candidates for this session");
  }
  return withoutTurnServers(next);
}
