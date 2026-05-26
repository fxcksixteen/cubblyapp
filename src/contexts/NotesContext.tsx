import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  KeyMaterial,
  setupNewKey,
  unlockKey,
  encryptJson,
  decryptJson,
  trustDevice,
  isDeviceTrusted,
  unlockTrustedDevice,
  revokeDeviceTrust,
  encryptBytes,
  decryptBytes,
  b64encode,
  b64decode,
  randomBytes,
} from "@/lib/notesCrypto";

export interface NotePlaintext {
  title: string;
  body: string; // HTML
  attachments?: Array<{ id: string; name: string; mime: string; size: number; storagePath: string; iv: string }>;
}

function normalizeNotePlaintext(plain: NotePlaintext): NotePlaintext {
  // Be VERY liberal with legacy attachment shapes from earlier desktop/web
  // versions and from third-party clients. We accept several common key
  // aliases for the storage path AND the IV. We only drop entries that have
  // no resolvable storage path at all — entries missing an IV are still
  // surfaced so the user can see they exist (downloadAttachment will fall
  // back to fetching the raw blob without decryption in that case).
  const attachments = (plain.attachments || []).map((a: any) => ({
    id: String(a.id || crypto.randomUUID()),
    name: String(a.name || a.filename || a.fileName || "Attachment"),
    mime: String(a.mime || a.type || a.contentType || a.mimeType || "application/octet-stream"),
    size: Number(a.size || a.byteSize || a.bytes || 0),
    storagePath: String(a.storagePath || a.storage_path || a.path || a.key || a.objectKey || ""),
    iv: String(a.iv || a.IV || a.nonce || a.initVector || ""),
  })).filter((a) => !!a.storagePath);
  return { ...plain, attachments };
}

export interface NoteRow {
  id: string;
  user_id: string;
  iv: string;
  ciphertext: string;
  pinned: boolean;
  sort_order: number;
  byte_size: number;
  created_at: string;
  updated_at: string;
  decrypted?: NotePlaintext | null;
  decryptError?: boolean;
}

interface NotesContextValue {
  // unlock state
  hasKey: boolean;
  isLocked: boolean;
  isInitializing: boolean;
  hasExistingVault: boolean | null;
  trustedHere: boolean;
  // actions
  setupVault: (pin: string, trust: boolean) => Promise<void>;
  unlock: (pin: string, trust: boolean) => Promise<boolean>;
  lock: () => void;
  forgetDevice: () => Promise<void>;
  // notes
  notes: NoteRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  createNote: (plain: NotePlaintext) => Promise<NoteRow | null>;
  updateNote: (id: string, plain: NotePlaintext) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  togglePin: (id: string, pinned: boolean) => Promise<void>;
  // attachments
  uploadAttachment: (file: File) => Promise<{ id: string; name: string; mime: string; size: number; storagePath: string; iv: string }>;
  downloadAttachment: (att: { storagePath: string; iv: string; mime: string; name: string }) => Promise<Blob>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export const NotesProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [hasExistingVault, setHasExistingVault] = useState<boolean | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const trustedHere = !!user && isDeviceTrusted(user.id);

  // On mount / user change: check for existing vault & try trusted-device unlock.
  useEffect(() => {
    if (!user) {
      setKey(null);
      setHasExistingVault(null);
      setIsInitializing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setIsInitializing(true);
      const { data } = await supabase
        .from("notes_keys")
        .select("salt")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const exists = !!data;
      setHasExistingVault(exists);
      if (exists && isDeviceTrusted(user.id)) {
        const k = await unlockTrustedDevice(user.id);
        if (!cancelled && k) setKey(k);
      }
      if (!cancelled) setIsInitializing(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const decryptAll = useCallback(async (rows: NoteRow[], k: CryptoKey) => {
    const out: NoteRow[] = [];
    for (const r of rows) {
      try {
        const plain = normalizeNotePlaintext(await decryptJson<NotePlaintext>(k, r.iv, r.ciphertext));
        out.push({ ...r, decrypted: plain });
      } catch {
        out.push({ ...r, decrypted: null, decryptError: true });
      }
    }
    return out;
  }, []);

  const refresh = useCallback(async () => {
    if (!user || !key) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", user.id)
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (!error && data) {
      const dec = await decryptAll(data as NoteRow[], key);
      setNotes(dec);
    }
    setLoading(false);
  }, [user, key, decryptAll]);

  useEffect(() => { if (key) refresh(); else setNotes([]); }, [key, refresh]);

  const setupVault = useCallback(async (pin: string, trust: boolean) => {
    if (!user) throw new Error("Not signed in");
    const { key: k, material } = await setupNewKey(pin);
    const { error } = await supabase.from("notes_keys").insert({
      user_id: user.id,
      salt: material.salt,
      verifier_iv: material.verifier_iv,
      verifier_ciphertext: material.verifier_ciphertext,
      iterations: material.iterations,
    });
    if (error) throw error;
    setKey(k);
    setHasExistingVault(true);
    if (trust) await trustDevice(user.id, k);
  }, [user]);

  const unlock = useCallback(async (pin: string, trust: boolean) => {
    if (!user) return false;
    const { data } = await supabase
      .from("notes_keys")
      .select("salt, verifier_iv, verifier_ciphertext, iterations")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!data) return false;
    const material: KeyMaterial = {
      salt: data.salt,
      verifier_iv: data.verifier_iv,
      verifier_ciphertext: data.verifier_ciphertext,
      iterations: data.iterations,
    };
    const k = await unlockKey(pin, material);
    if (!k) return false;
    setKey(k);
    if (trust) await trustDevice(user.id, k);
    return true;
  }, [user]);

  const lock = useCallback(() => { setKey(null); setNotes([]); }, []);

  const forgetDevice = useCallback(async () => {
    if (!user) return;
    await revokeDeviceTrust(user.id);
    setKey(null);
    setNotes([]);
  }, [user]);

  const createNote = useCallback(async (plain: NotePlaintext): Promise<NoteRow | null> => {
    if (!user || !key) return null;
    const { iv, ciphertext } = await encryptJson(key, plain);
    const byte_size = ciphertext.length;
    const { data, error } = await supabase
      .from("notes")
      .insert({ user_id: user.id, iv, ciphertext, byte_size })
      .select("*")
      .single();
    if (error || !data) return null;
    const row: NoteRow = { ...(data as NoteRow), decrypted: plain };
    setNotes((prev) => [row, ...prev]);
    return row;
  }, [user, key]);

  const updateNote = useCallback(async (id: string, plain: NotePlaintext) => {
    if (!user || !key) return;
    const { iv, ciphertext } = await encryptJson(key, plain);
    const { error } = await supabase
      .from("notes")
      .update({ iv, ciphertext, byte_size: ciphertext.length, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, iv, ciphertext, byte_size: ciphertext.length, decrypted: plain, updated_at: new Date().toISOString() } : n)));
  }, [user, key]);

  const deleteNote = useCallback(async (id: string) => {
    if (!user) return;
    // Best-effort: clean attachment objects belonging to this note
    const target = notes.find((n) => n.id === id);
    const paths = target?.decrypted?.attachments?.map((a) => a.storagePath) || [];
    if (paths.length) {
      try { await supabase.storage.from("notes-attachments").remove(paths); } catch {/* ignore */}
    }
    await supabase.from("notes").delete().eq("id", id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, [user, notes]);

  const togglePin = useCallback(async (id: string, pinned: boolean) => {
    await supabase.from("notes").update({ pinned }).eq("id", id);
    setNotes((prev) =>
      [...prev.map((n) => (n.id === id ? { ...n, pinned } : n))]
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.updated_at > a.updated_at ? 1 : -1))
    );
  }, []);

  const uploadAttachment = useCallback(async (file: File) => {
    if (!user || !key) throw new Error("Locked");
    const buf = await file.arrayBuffer();
    const { iv, ciphertext } = await encryptBytes(key, buf);
    const id = crypto.randomUUID();
    const storagePath = `${user.id}/${id}.bin`;
    const blob = new Blob([ciphertext], { type: "application/octet-stream" });
    const { error } = await supabase.storage.from("notes-attachments").upload(storagePath, blob, { upsert: false });
    if (error) throw error;
    return { id, name: file.name, mime: file.type || "application/octet-stream", size: file.size, storagePath, iv };
  }, [user, key]);

  const downloadAttachment = useCallback(async (att: { storagePath?: string; storage_path?: string; path?: string; iv?: string; mime: string; name: string }) => {
    if (!key) throw new Error("Locked");
    const storagePath = att.storagePath || att.storage_path || att.path;
    if (!storagePath) throw new Error("Missing attachment path");
    const { data, error } = await supabase.storage.from("notes-attachments").download(storagePath);
    if (error || !data) throw error || new Error("Download failed");
    const buf = await data.arrayBuffer();
    // Legacy fallback: very old attachments were uploaded unencrypted (no
    // iv was stored). If we have no iv, just return the raw blob so the
    // user can still view their image / video / file.
    if (!att.iv) {
      return new Blob([buf], { type: att.mime });
    }
    try {
      const plain = await decryptBytes(key, att.iv, buf);
      return new Blob([plain], { type: att.mime });
    } catch (e) {
      // Decryption failed — most likely a legacy blob that was never
      // encrypted with this key. Fall back to the raw bytes so the user
      // at least sees the original file instead of a broken tile.
      console.warn("[Notes] decrypt failed, serving raw blob:", e);
      return new Blob([buf], { type: att.mime });
    }
  }, [key]);

  const value = useMemo<NotesContextValue>(() => ({
    hasKey: !!key,
    isLocked: !key,
    isInitializing,
    hasExistingVault,
    trustedHere,
    setupVault,
    unlock,
    lock,
    forgetDevice,
    notes,
    loading,
    refresh,
    createNote,
    updateNote,
    deleteNote,
    togglePin,
    uploadAttachment,
    downloadAttachment,
  }), [key, isInitializing, hasExistingVault, trustedHere, setupVault, unlock, lock, forgetDevice, notes, loading, refresh, createNote, updateNote, deleteNote, togglePin, uploadAttachment, downloadAttachment]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export const useNotes = () => {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
};
