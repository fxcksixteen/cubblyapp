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
  attachments?: Array<{ id: string; name: string; mime: string; size: number; storagePath: string; iv: string; noteId?: string }>;
}

export interface NoteAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  storagePath: string;
  iv: string;
  noteId?: string;
}

type StoredAttachmentRecord = NoteAttachment & { createdAt?: string; updatedAt?: string; hasNoteBinding?: boolean };
type StoredAttachmentIndex = Map<string, Partial<StoredAttachmentRecord>>;

function extractNotesStoragePath(value?: string | null): string {
  if (!value) return "";
  // Strip query parameters for comparison and path extraction
  const clean = String(value).split("?")[0];
  try {
    const u = new URL(clean);
    // Handle Supabase storage URLs (signed/public/authenticated)
    const match = u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/(?:notes-attachments|attachments)\/(.+)$/);
    if (match) return decodeURIComponent(match[1]);

    // Fallback for other Supabase-like paths containing the bucket name
    if (u.pathname.includes("notes-attachments/")) {
      return decodeURIComponent(u.pathname.split("notes-attachments/").pop() || "");
    } else if (u.pathname.includes("attachments/")) {
      return decodeURIComponent(u.pathname.split("attachments/").pop() || "");
    }
  } catch {
    // Plain storage paths are not valid URLs
  }

  // For non-URL strings, strip bucket prefix if present
  if (clean.includes("notes-attachments/")) {
    return decodeURIComponent(clean.split("notes-attachments/").pop() || "");
  } else if (clean.includes("attachments/")) {
    return decodeURIComponent(clean.split("attachments/").pop() || "");
  }
  return clean;
}

function extractLegacyInlineAttachments(body?: string): unknown[] {
  if (!body) return [];
  const out: unknown[] = [];
  const tagRe = /<(img|video)\b[^>]*>/gi;
  const attrRe = /([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(body))) {
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRe.exec(tagMatch[0]))) attrs[attrMatch[1].toLowerCase()] = attrMatch[3];
    const srcPath = extractNotesStoragePath(attrs.src || attrs["data-src"] || attrs["data-storage-path"] || attrs["data-path"]);
    const id = attrs["data-att-id"] || attrs["data-attachment-id"] || srcPath.split("/").pop()?.replace(/\.bin$/i, "") || "";
    if (id || srcPath) {
      out.push({
        id,
        name: attrs["data-att-name"] || attrs.alt || attrs.title || "Attachment",
        mime: attrs["data-att-mime"] || (tagMatch[1].toLowerCase() === "video" ? "video/mp4" : "image/*"),
        size: Number(attrs["data-att-size"] || 0),
        storagePath: srcPath,
        iv: attrs["data-iv"] || attrs["data-att-iv"] || "",
        noteId: attrs["data-note-id"] || "",
      });
    }
  }
  return out;
}

function isOwnedAttachmentPath(path: string, ownerUserId?: string): boolean {
  if (!path || !ownerUserId) return !!path;
  return path === ownerUserId || path.startsWith(`${ownerUserId}/`);
}

function getStoredCandidate(index: StoredAttachmentIndex | undefined, id: string, storagePath: string) {
  return (storagePath && index?.get(storagePath)) || (id && index?.get(id)) || undefined;
}

function attachmentKeys(att: { id?: string; storagePath?: string }) {
  return [att.id || "", extractNotesStoragePath(att.storagePath || "")].filter(Boolean);
}

function timeMs(value?: string) {
  const t = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(t) ? t : 0;
}

function normalizeNotePlaintext(plain: NotePlaintext, ownerUserId?: string, storageIndex?: StoredAttachmentIndex, noteId?: string): NotePlaintext {
  // Be VERY liberal with legacy attachment shapes from earlier desktop/web
  // versions and from third-party clients. We accept several common key
  // aliases for the storage path AND the IV. We handle both array and
  // object-based attachment collections.
  // Recover attachments from MULTIPLE top-level legacy keys. Older clients
  // saved them under `files`, `media`, `images`, or `attached`. Without
  // pulling them in too, those attachments looked permanently gone.
  const buckets: any[] = [];
  const p: any = plain || {};
  for (const k of ["attachments", "files", "media", "images", "attached"]) {
    const v = p[k];
    if (Array.isArray(v)) buckets.push(...v);
    else if (v && typeof v === "object") buckets.push(...Object.values(v));
  }
  buckets.push(...extractLegacyInlineAttachments(p.body));
  let raw: any[] = buckets;
  if (!Array.isArray(raw)) raw = [];

  const seen = new Set<string>();
  const attachments = raw.map((a: any) => {
    if (typeof a === "string") {
      a = { storagePath: a };
    }
    const id = String(a.id || a.uuid || a.uid || "");
    let storagePath = extractNotesStoragePath(
      a.storagePath || a.storage_path || a.path || a.fullPath || a.full_path ||
      a.key || a.objectKey || a.url || a.signedUrl || a.signed_url || a.attachment_path ||
      a.attachment_url || a.file_path || a.filePath || ""
    );
    if (!storagePath && ownerUserId && id) {
      storagePath = String(storageIndex?.get(id)?.storagePath || `${ownerUserId}/${id}.bin`);
    }
    const stored = getStoredCandidate(storageIndex, id, storagePath);
    const finalId = String(id || stored?.id || storagePath.split("/").pop()?.replace(/\.bin$/i, "") || crypto.randomUUID());
    const finalPath = extractNotesStoragePath(storagePath || stored?.storagePath || "");
    const attachmentNoteId = String(a.noteId || a.note_id || (stored as any)?.noteId || "");
    if (noteId && attachmentNoteId && attachmentNoteId !== noteId) return null;
    if (!isOwnedAttachmentPath(finalPath, ownerUserId)) return null;
    const key = finalPath || finalId;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      id: finalId,
      name: String(a.name || a.filename || a.fileName || stored?.name || "Attachment"),
      mime: String(a.mime || a.type || a.contentType || a.mimeType || stored?.mime || "application/octet-stream"),
      size: Number(a.size || a.byteSize || a.bytes || stored?.size || 0),
      storagePath: finalPath,
      iv: String(a.iv || a.IV || a.nonce || a.initVector || a.initializationVector || a.init_vector || stored?.iv || ""),
      noteId: attachmentNoteId || noteId,
    };
  }).filter((a): a is NonNullable<typeof a> => !!a?.storagePath) as NoteAttachment[];

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
  uploadAttachment: (file: File, noteId?: string) => Promise<NoteAttachment>;
  downloadAttachment: (att: { storagePath: string; iv?: string; mime: string; name: string }) => Promise<Blob>;
  listRecoverableAttachmentsForNote: (noteId: string) => Promise<NoteAttachment[]>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

async function loadStoredAttachmentRecords(ownerUserId: string): Promise<StoredAttachmentRecord[]> {
  const records: StoredAttachmentRecord[] = [];
  const { data, error } = await supabase.storage.from("notes-attachments").list(ownerUserId, {
    limit: 1000,
    sortBy: { column: "created_at", order: "desc" },
  });
  if (error || !data) return records;
  for (const file of data) {
    if (!file.name || file.name.endsWith("/")) continue;
    const id = file.name.replace(/\.bin$/i, "");
    const metadata = (file.metadata || {}) as Record<string, unknown>;
    const storagePath = `${ownerUserId}/${file.name}`;
    const size = Number(metadata.size || metadata.contentLength || metadata.contentLengthExact || 0);
    const noteId = String(metadata.noteId || metadata.note_id || metadata.note || "");
    records.push({
      id,
      name: String(metadata.originalName || metadata.name || `Attachment ${id.slice(0, 8)}`),
      mime: String(metadata.mime || metadata.mimetype || metadata.contentType || "application/octet-stream"),
      size: Number.isFinite(size) ? size : 0,
      storagePath,
      iv: String(metadata.iv || ""),
      noteId: noteId || undefined,
      createdAt: String((file as any).created_at || (file as any).createdAt || metadata.lastModified || ""),
      updatedAt: String((file as any).updated_at || (file as any).updatedAt || ""),
      hasNoteBinding: !!noteId,
    });
  }
  return records;
}

async function loadStoredAttachmentIndex(ownerUserId: string): Promise<StoredAttachmentIndex> {
  const index: StoredAttachmentIndex = new Map();
  const records = await loadStoredAttachmentRecords(ownerUserId);
  for (const att of records) {
    index.set(att.id, att);
    index.set(att.storagePath, att);
  }
  return index;
}

// ---- MIME classification for recovered / legacy attachments ----
// Old uploads were stored with `application/octet-stream` and generic names
// like "Attachment c9354dbf". To make Insert (image/video/PDF) work we sniff
// the actual decrypted bytes and rewrite the attachment metadata at the
// data layer so the UI sees a correctly-typed attachment from first render.
const PREVIEWABLE_IMAGE_EXT = new Set(["png","jpg","jpeg","gif","webp","heic","heif","bmp","avif","svg"]);
const PREVIEWABLE_VIDEO_EXT = new Set(["mp4","mov","m4v","webm","mkv","avi"]);
const GENERIC_ATTACHMENT_MIME = new Set(["", "application/octet-stream", "binary/octet-stream"]);
const hasNameExtension = (name?: string) => /\.[a-z0-9]{2,5}$/i.test(name || "");
const isPreviewableMime = (mime?: string) => {
  const m = (mime || "").toLowerCase();
  return m.startsWith("image/") || m.startsWith("video/") || m === "application/pdf";
};
function attachmentMimeFromName(name?: string): string {
  const n = name || "";
  const dot = n.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = n.slice(dot + 1).toLowerCase();
  if (PREVIEWABLE_IMAGE_EXT.has(ext)) return ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
  if (PREVIEWABLE_VIDEO_EXT.has(ext)) return `video/${ext === "mov" ? "quicktime" : ext}`;
  if (ext === "pdf") return "application/pdf";
  return "";
}
function attachmentExtensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "image/jpeg") return "jpg";
  if (m === "image/svg+xml") return "svg";
  if (m.startsWith("image/")) return m.slice(6);
  if (m === "video/quicktime") return "mov";
  if (m.startsWith("video/")) return m.slice(6);
  if (m === "application/pdf") return "pdf";
  return "";
}
function attachmentNameWithExt(name: string, mime: string): string {
  if (hasNameExtension(name)) return name;
  const ext = attachmentExtensionForMime(mime);
  return ext ? `${name}.${ext}` : name;
}
async function sniffAttachmentMimeFromBlob(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 32).arrayBuffer());
  const hex = Array.from(head).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ascii = String.fromCharCode(...head);
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("47494638")) return "image/gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  if (ascii.trimStart().startsWith("<svg")) return "image/svg+xml";
  if (hex.startsWith("25504446")) return "application/pdf";
  if (hex.startsWith("00000018") || hex.startsWith("00000020") || hex.includes("66747970")) return "video/mp4";
  if (hex.startsWith("1a45dfa3")) return "video/webm";
  return "";
}
function needsClassification(att: { mime?: string; name?: string }): boolean {
  const m = (att.mime || "").toLowerCase();
  if (isPreviewableMime(m) && hasNameExtension(att.name)) return false;
  if (GENERIC_ATTACHMENT_MIME.has(m)) return true;
  if (!hasNameExtension(att.name)) return true;
  return false;
}
async function classifyAttachment(att: NoteAttachment, k: CryptoKey): Promise<NoteAttachment> {
  // First try the filename — cheap and avoids a network round-trip.
  const fromName = attachmentMimeFromName(att.name);
  if (fromName) {
    return { ...att, mime: fromName, name: attachmentNameWithExt(att.name, fromName) };
  }
  try {
    const { data, error } = await supabase.storage.from("notes-attachments").download(att.storagePath);
    if (error || !data) return att;
    const buf = await data.arrayBuffer();
    let plainBlob: Blob;
    if (!att.iv) {
      plainBlob = new Blob([buf]);
    } else {
      try {
        const plain = await decryptBytes(k, att.iv, buf);
        plainBlob = new Blob([plain]);
      } catch {
        plainBlob = new Blob([buf]);
      }
    }
    const sniffed = await sniffAttachmentMimeFromBlob(plainBlob);
    if (!sniffed) return att;
    const safeName = att.name || `Attachment ${att.id.slice(0, 8)}`;
    return { ...att, mime: sniffed, name: attachmentNameWithExt(safeName, sniffed) };
  } catch {
    return att;
  }
}
async function classifyAttachments(list: NoteAttachment[], k: CryptoKey): Promise<{ list: NoteAttachment[]; changed: boolean }> {
  let changed = false;
  const out: NoteAttachment[] = [];
  for (const att of list) {
    if (!needsClassification(att)) { out.push(att); continue; }
    const next = await classifyAttachment(att, k);
    if (next.mime !== att.mime || next.name !== att.name) changed = true;
    out.push(next);
  }
  return { list: out, changed };
}

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

  const decryptAll = useCallback(async (rows: NoteRow[], k: CryptoKey, ownerUserId: string) => {
    const storageIndex = await loadStoredAttachmentIndex(ownerUserId);
    const out: NoteRow[] = [];
    for (const r of rows) {
      try {
        const plain = normalizeNotePlaintext(await decryptJson<NotePlaintext>(k, r.iv, r.ciphertext), ownerUserId, storageIndex, r.id);
        // Classify any legacy/generic attachments BEFORE the UI ever sees the
        // note, so Insert buttons appear immediately for image/video/PDF.
        const atts = plain.attachments || [];
        if (atts.length) {
          const { list, changed } = await classifyAttachments(atts, k);
          plain.attachments = list;
          if (changed) {
            // Persist the corrected metadata back into the encrypted note so
            // it stays fixed across refreshes. Fire-and-forget; ignore errors.
            (async () => {
              try {
                const { iv, ciphertext } = await encryptJson(k, plain);
                await supabase.from("notes").update({ iv, ciphertext, byte_size: ciphertext.length }).eq("id", r.id);
              } catch { /* ignore */ }
            })();
          }
        }
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
      const dec = await decryptAll(data as NoteRow[], key, user.id);
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
    const row: NoteRow = { ...(data as NoteRow), decrypted: normalizeNotePlaintext(plain, user.id, undefined, data.id) };
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
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, iv, ciphertext, byte_size: ciphertext.length, decrypted: normalizeNotePlaintext(plain, user.id, undefined, id), updated_at: new Date().toISOString() } : n)));
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

  const uploadAttachment = useCallback(async (file: File, noteId?: string) => {
    if (!user || !key) throw new Error("Locked");
    const buf = await file.arrayBuffer();
    const { iv, ciphertext } = await encryptBytes(key, buf);
    const id = crypto.randomUUID();
    const storagePath = `${user.id}/${id}.bin`;
    const blob = new Blob([ciphertext], { type: "application/octet-stream" });
    const { error } = await supabase.storage.from("notes-attachments").upload(storagePath, blob, {
      upsert: false,
      metadata: { iv, originalName: file.name, mime: file.type || "application/octet-stream", size: file.size, noteId: noteId || "" },
    });
    if (error) throw error;
    return { id, name: file.name, mime: file.type || "application/octet-stream", size: file.size, storagePath, iv, noteId };
  }, [user, key]);

  const downloadAttachment = useCallback(async (att: { storagePath?: string; storage_path?: string; path?: string; iv?: string; mime: string; name: string }) => {
    if (!user || !key) throw new Error("Locked");
    const storagePath = extractNotesStoragePath(att.storagePath || att.storage_path || att.path || (att as any).fullPath || (att as any).full_path || (att as any).key || (att as any).objectKey || (att as any).url || (att as any).signedUrl || (att as any).signed_url);
    if (!storagePath) throw new Error("Missing attachment path");
    if (!isOwnedAttachmentPath(storagePath, user.id)) throw new Error("Attachment does not belong to this vault");
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
  }, [user, key]);

  const listRecoverableAttachmentsForNote = useCallback(async (noteId: string) => {
    if (!user || !noteId) return [];
    const note = notes.find((n) => n.id === noteId);
    if (!note?.decrypted) return [];

    const existing = new Set<string>();
    for (const att of note.decrypted.attachments || []) {
      for (const k of attachmentKeys(att)) existing.add(k);
    }

    const records = await loadStoredAttachmentRecords(user.id);
    const sortedNotes = [...notes].sort((a, b) => timeMs(a.created_at) - timeMs(b.created_at));
    const LEGACY_ATTACH_WINDOW_MS = 10 * 60 * 1000;

    const filtered = records.filter((att) => {
      if (!isOwnedAttachmentPath(att.storagePath, user.id)) return false;
      if (attachmentKeys(att).some((k) => existing.has(k))) return false;

      if (att.noteId) return att.noteId === noteId;

      // Old uploads did not store noteId. To avoid the previous scary bug,
      // never show all vault files in every note: only infer a note when the
      // file was uploaded immediately after that note was created.
      const created = timeMs(att.createdAt || att.updatedAt);
      if (!created) return false;
      let inferred: NoteRow | undefined;
      for (const candidate of sortedNotes) {
        const noteCreated = timeMs(candidate.created_at);
        if (noteCreated <= created && created - noteCreated <= LEGACY_ATTACH_WINDOW_MS) {
          if (!inferred || noteCreated > timeMs(inferred.created_at)) inferred = candidate;
        }
      }
      return inferred?.id === noteId;
    }).map<NoteAttachment>((att) => ({ ...att, noteId }));

    // Classify recovered attachments BEFORE returning so the UI gets correct
    // image/video/PDF metadata on the very first render and shows Insert.
    if (!key) return filtered;
    const { list } = await classifyAttachments(filtered, key);
    return list;
  }, [user, notes, key]);

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
    listRecoverableAttachmentsForNote,
  }), [key, isInitializing, hasExistingVault, trustedHere, setupVault, unlock, lock, forgetDevice, notes, loading, refresh, createNote, updateNote, deleteNote, togglePin, uploadAttachment, downloadAttachment, listRecoverableAttachmentsForNote]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

export const useNotes = () => {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
};
