// Sound effect manager — plays notification audio while respecting Do-Not-Disturb.
// Sounds are stored in /public/sounds and loaded lazily.

type SoundKey = "message" | "outgoingRing" | "incomingCall" | "leaveCall";

// Use new URL(...) so Vite resolves the asset URL relative to the bundle.
// Critically, this works under Electron's `file://` (where leading "/" paths
// silently 404) AND under web. Falls back to a plain string if URL fails.
function resolveSoundUrl(name: string): string {
  try {
    return new URL(`/sounds/${name}`, import.meta.url).href;
  } catch {
    return `/sounds/${name}`;
  }
}

const SOUND_PATHS: Record<SoundKey, string> = {
  message: resolveSoundUrl("message.wav"),
  outgoingRing: resolveSoundUrl("outgoing-ring.wav"),
  incomingCall: resolveSoundUrl("incoming-call.wav"),
  leaveCall: resolveSoundUrl("leave-call.wav"),
};

const audioCache: Partial<Record<SoundKey, HTMLAudioElement>> = {};
const loopingAudio: Partial<Record<SoundKey, HTMLAudioElement>> = {};

let dndActive = false;

export function setDndActive(value: boolean) {
  dndActive = value;
  if (value) {
    stopLooping("outgoingRing");
    stopLooping("incomingCall");
  }
}

export function isDndActive() {
  return dndActive;
}

function getAudio(key: SoundKey): HTMLAudioElement {
  let audio = audioCache[key];
  if (!audio) {
    audio = new Audio(SOUND_PATHS[key]);
    audio.preload = "auto";
    audio.volume = 0.55;
    audioCache[key] = audio;
  }
  return audio;
}

const CALL_SOUNDS: SoundKey[] = ["outgoingRing", "incomingCall", "leaveCall"];

function isGamingSuppressed(key: SoundKey): boolean {
  if (typeof window === "undefined") return false;
  const general = (window as any).__cubblySuppress;
  if (!general) return false;
  if (CALL_SOUNDS.includes(key)) {
    return !!(window as any).__cubblySuppressCalls;
  }
  return true;
}

export function playSound(key: SoundKey, options?: { force?: boolean; volume?: number }) {
  if (dndActive && !options?.force) return;
  if (!options?.force && isGamingSuppressed(key)) return;
  try {
    const base = getAudio(key);
    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.volume = options?.volume ?? 0.55;
    void clone.play().catch((err) => {
      // Common in Electron before any user gesture — log once for debugging.
      if ((window as any).__cubblyAudioWarned) return;
      (window as any).__cubblyAudioWarned = true;
      console.warn("[sounds] play blocked:", err?.message || err);
    });
  } catch {
    // ignore
  }
}

export function playLooping(key: SoundKey, options?: { force?: boolean; volume?: number }) {
  if (dndActive && !options?.force) return;
  if (!options?.force && isGamingSuppressed(key)) return;
  stopLooping(key);
  try {
    const audio = new Audio(SOUND_PATHS[key]);
    audio.loop = true;
    audio.volume = options?.volume ?? 0.45;
    void audio.play().catch(() => {});
    loopingAudio[key] = audio;
  } catch {
    // ignore
  }
}

export function stopLooping(key: SoundKey) {
  const audio = loopingAudio[key];
  if (audio) {
    try { audio.pause(); } catch {}
    audio.currentTime = 0;
    delete loopingAudio[key];
  }
}

export function preloadAllSounds() {
  (Object.keys(SOUND_PATHS) as SoundKey[]).forEach(getAudio);
}
