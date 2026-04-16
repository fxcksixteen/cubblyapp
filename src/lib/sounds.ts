// Sound effect manager — plays notification audio while respecting Do-Not-Disturb.
// Sounds are stored in /public/sounds and loaded lazily.

type SoundKey = "message" | "outgoingRing" | "incomingCall" | "leaveCall";

const SOUND_PATHS: Record<SoundKey, string> = {
  message: "/sounds/message.wav",
  outgoingRing: "/sounds/outgoing-ring.wav",
  incomingCall: "/sounds/incoming-call.wav",
  leaveCall: "/sounds/leave-call.wav",
};

const audioCache: Partial<Record<SoundKey, HTMLAudioElement>> = {};
const loopingAudio: Partial<Record<SoundKey, HTMLAudioElement>> = {};

// Local DND flag — set by AuthContext / status updates.
// When true, no sounds and no desktop notifications fire.
let dndActive = false;

export function setDndActive(value: boolean) {
  dndActive = value;
  if (value) {
    // Immediately stop any looping ring sounds when DND turns on
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

export function playSound(key: SoundKey, options?: { force?: boolean; volume?: number }) {
  if (dndActive && !options?.force) return;
  try {
    const base = getAudio(key);
    // Clone the node so overlapping plays don't truncate each other
    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.volume = options?.volume ?? 0.55;
    void clone.play().catch(() => {});
  } catch {
    // ignore
  }
}

export function playLooping(key: SoundKey, options?: { force?: boolean; volume?: number }) {
  if (dndActive && !options?.force) return;
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
