/**
 * Notes encryption — zero-knowledge AES-GCM with PBKDF2-derived key.
 *
 * The PIN never leaves the device. The server only ever sees:
 *   - a random salt
 *   - a "verifier" ciphertext (proves the user knows the right PIN)
 *   - opaque encrypted note + attachment blobs
 */

const KNOWN_VERIFIER_PLAINTEXT = "cubbly-notes-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64encode(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

async function deriveKey(pin: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can wrap for trusted-device storage
    ["encrypt", "decrypt"]
  );
}

export interface KeyMaterial {
  salt: string;
  verifier_iv: string;
  verifier_ciphertext: string;
  iterations: number;
}

/** Derive AES key from PIN, returning material that can be stored on the server. */
export async function setupNewKey(pin: string): Promise<{ key: CryptoKey; material: KeyMaterial }> {
  const salt = randomBytes(16);
  const iterations = 250000;
  const key = await deriveKey(pin, salt, iterations);
  const iv = randomBytes(12);
  const verifier = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(KNOWN_VERIFIER_PLAINTEXT));
  return {
    key,
    material: {
      salt: b64encode(salt),
      verifier_iv: b64encode(iv),
      verifier_ciphertext: b64encode(verifier),
      iterations,
    },
  };
}

/** Try a PIN against an existing material; returns the key on success or null. */
export async function unlockKey(pin: string, material: KeyMaterial): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(pin, b64decode(material.salt), material.iterations);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64decode(material.verifier_iv) },
      key,
      b64decode(material.verifier_ciphertext)
    );
    if (dec.decode(plain) === KNOWN_VERIFIER_PLAINTEXT) return key;
    return null;
  } catch {
    return null;
  }
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ iv: string; ciphertext: string }> {
  const iv = randomBytes(12);
  const data = enc.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data);
  return { iv: b64encode(iv), ciphertext: b64encode(ct) };
}

export async function decryptJson<T = unknown>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(iv) },
    key,
    b64decode(ciphertext)
  );
  return JSON.parse(dec.decode(plain)) as T;
}

export async function encryptBytes(key: CryptoKey, bytes: ArrayBuffer): Promise<{ iv: string; ciphertext: ArrayBuffer }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, bytes);
  return { iv: b64encode(iv), ciphertext: ct };
}

export async function decryptBytes(key: CryptoKey, iv: string, ciphertext: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(iv) }, key, ciphertext);
}

/* ──────────────────────────────────────────────────────────
   Trusted-device storage. We wrap the master key with a per-device
   key kept in IndexedDB (non-extractable). localStorage stores only
   the wrapped blob + a device id. Clearing storage = revoking trust.
   ────────────────────────────────────────────────────────── */

const DB_NAME = "cubbly-notes";
const STORE = "device-keys";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<CryptoKey | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: CryptoKey): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const TRUST_LS_KEY = (userId: string) => `cubbly:notes-trust:${userId}`;

/** Persist a wrapped copy of the master key so the device can unlock without PIN. */
export async function trustDevice(userId: string, masterKey: CryptoKey): Promise<void> {
  let deviceKey = await idbGet(`device:${userId}`);
  if (!deviceKey) {
    deviceKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
    await idbSet(`device:${userId}`, deviceKey);
  }
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", masterKey, deviceKey, { name: "AES-GCM", iv: iv as BufferSource });
  localStorage.setItem(TRUST_LS_KEY(userId), JSON.stringify({ iv: b64encode(iv), wrapped: b64encode(wrapped) }));
}

export function isDeviceTrusted(userId: string): boolean {
  return !!localStorage.getItem(TRUST_LS_KEY(userId));
}

export async function unlockTrustedDevice(userId: string): Promise<CryptoKey | null> {
  const blob = localStorage.getItem(TRUST_LS_KEY(userId));
  if (!blob) return null;
  try {
    const { iv, wrapped } = JSON.parse(blob);
    const deviceKey = await idbGet(`device:${userId}`);
    if (!deviceKey) return null;
    return crypto.subtle.unwrapKey(
      "raw",
      b64decode(wrapped),
      deviceKey,
      { name: "AES-GCM", iv: b64decode(iv) },
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  } catch {
    return null;
  }
}

export async function revokeDeviceTrust(userId: string): Promise<void> {
  localStorage.removeItem(TRUST_LS_KEY(userId));
  try {
    await idbDelete(`device:${userId}`);
  } catch {/* ignore */}
}
