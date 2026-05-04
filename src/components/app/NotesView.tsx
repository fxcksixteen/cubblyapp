import { useEffect, useRef, useState } from "react";
import { useNotes, NoteRow, NotePlaintext } from "@/contexts/NotesContext";
import { Lock, Pin, PinOff, Trash2, Plus, Paperclip, ShieldCheck, Loader2, FileText, Download, X, EyeOff } from "lucide-react";
import { toast } from "sonner";

const MAX_PIN = 12;
const MIN_PIN = 4;

const NotesView = () => {
  const n = useNotes();

  if (n.isInitializing) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ backgroundColor: "var(--app-bg-primary)" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--app-text-secondary)" }} />
      </div>
    );
  }

  if (n.isLocked) return <LockScreen />;
  return <NotesEditor />;
};

/* ─────────── Lock / Setup screen ─────────── */
const LockScreen = () => {
  const n = useNotes();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const setup = !n.hasExistingVault;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < MIN_PIN) return toast.error(`PIN must be at least ${MIN_PIN} characters`);
    if (pin.length > MAX_PIN) return toast.error(`PIN must be at most ${MAX_PIN} characters`);
    if (setup && pin !== confirmPin) return toast.error("PINs do not match");
    setBusy(true);
    try {
      if (setup) {
        await n.setupVault(pin, trust);
        toast.success("Vault created");
      } else {
        const ok = await n.unlock(pin, trust);
        if (!ok) toast.error("Wrong PIN");
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-6" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      <form onSubmit={submit} className="w-full max-w-sm rounded-xl p-6 space-y-4" style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
            <Lock className="h-5 w-5" style={{ color: "hsl(var(--primary))" }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--app-text-primary)" }}>
              {setup ? "Create your private vault" : "Unlock your notes"}
            </h2>
            <p className="text-xs" style={{ color: "var(--app-text-secondary)" }}>
              {setup ? "Choose a PIN. We never see it — your notes are encrypted on this device." : "Enter your PIN to decrypt your notes."}
            </p>
          </div>
        </div>

        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          maxLength={MAX_PIN}
          className="w-full rounded-md px-3 py-2 outline-none"
          style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
        />
        {setup && (
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value)}
            placeholder="Confirm PIN"
            maxLength={MAX_PIN}
            className="w-full rounded-md px-3 py-2 outline-none"
            style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)", border: "1px solid var(--app-border)" }}
          />
        )}

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none" style={{ color: "var(--app-text-secondary)" }}>
          <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} className="accent-[hsl(var(--primary))]" />
          <ShieldCheck className="h-4 w-4" />
          Trust this device — skip PIN next time
        </label>

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md py-2 text-sm font-semibold disabled:opacity-50"
          style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
        >
          {busy ? "Working…" : setup ? "Create vault" : "Unlock"}
        </button>

        {!setup && (
          <p className="text-[11px] leading-snug" style={{ color: "var(--app-text-secondary)" }}>
            Forgot your PIN? Notes can't be recovered — they're end-to-end encrypted.
          </p>
        )}

        {setup && (
          <p className="text-[11px] leading-snug" style={{ color: "var(--app-text-secondary)" }}>
            ⚠ If you forget your PIN, your notes are permanently unrecoverable.
          </p>
        )}
      </form>
    </div>
  );
};

/* ─────────── Notes editor ─────────── */
const NotesEditor = () => {
  const n = useNotes();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = n.notes.find((x) => x.id === activeId) || null;

  useEffect(() => {
    if (!activeId && n.notes[0]) setActiveId(n.notes[0].id);
  }, [n.notes, activeId]);

  const create = async () => {
    const note = await n.createNote({ title: "Untitled", body: "" });
    if (note) setActiveId(note.id);
  };

  return (
    <div className="flex flex-1 min-h-0" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {/* Notes list */}
      <div className="w-72 flex flex-col border-r min-h-0" style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-bg-secondary)" }}>
        <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: "var(--app-border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Private notes</span>
          <div className="flex items-center gap-1">
            <button
              onClick={create}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors"
              title="New note"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
            >
              <Plus className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </button>
            <button
              onClick={() => n.lock()}
              className="flex h-7 w-7 items-center justify-center rounded transition-colors"
              title="Lock vault"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
            >
              <EyeOff className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {n.notes.length === 0 && (
            <div className="px-4 py-6 text-xs text-center" style={{ color: "var(--app-text-secondary)" }}>
              No notes yet. Click + to create one.
            </div>
          )}
          {n.notes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              active={note.id === activeId}
              onClick={() => setActiveId(note.id)}
            />
          ))}
        </div>

        <div className="px-3 py-2 border-t text-[10px] flex items-center gap-1" style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}>
          <ShieldCheck className="h-3 w-3" /> Encrypted on your device
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <NoteEditor note={active} key={active.id} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Select or create a note
          </div>
        )}
      </div>
    </div>
  );
};

const NoteListItem = ({ note, active, onClick }: { note: NoteRow; active: boolean; onClick: () => void }) => {
  const title = note.decrypted?.title || (note.decryptError ? "🔒 Decryption error" : "Untitled");
  const preview = stripHtml(note.decrypted?.body || "").slice(0, 60);
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 border-b transition-colors"
      style={{
        borderColor: "var(--app-border)",
        backgroundColor: active ? "var(--app-active, #404249)" : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "var(--app-hover)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = ""; }}
    >
      <div className="flex items-center gap-1.5">
        {note.pinned && <Pin className="h-3 w-3" style={{ color: "hsl(var(--primary))" }} />}
        <span className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>{title}</span>
      </div>
      {preview && <div className="text-xs truncate mt-0.5" style={{ color: "var(--app-text-secondary)" }}>{preview}</div>}
    </button>
  );
};

const NoteEditor = ({ note }: { note: NoteRow }) => {
  const n = useNotes();
  const [title, setTitle] = useState(note.decrypted?.title || "");
  const [body, setBody] = useState(note.decrypted?.body || "");
  const [attachments, setAttachments] = useState(note.decrypted?.attachments || []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);

  // Initialize body HTML once
  useEffect(() => {
    if (bodyRef.current && bodyRef.current.innerHTML !== body) {
      bodyRef.current.innerHTML = body;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Debounced autosave
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await n.updateNote(note.id, { title, body, attachments });
        dirty.current = false;
      } catch (e: any) {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [title, body, attachments, note.id, n]);

  const onUpload = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) return toast.error("File too large (25MB max)");
    setUploading(true);
    try {
      const att = await n.uploadAttachment(file);
      setAttachments((prev) => [...prev, att]);
      dirty.current = true;
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const downloadAtt = async (att: typeof attachments[0]) => {
    try {
      const blob = await n.downloadAttachment(att);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = att.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e: any) {
      toast.error("Download failed");
    }
  };

  const removeAtt = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    dirty.current = true;
  };

  const exec = (cmd: string) => {
    document.execCommand(cmd, false);
    if (bodyRef.current) {
      setBody(bodyRef.current.innerHTML);
      dirty.current = true;
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b" style={{ borderColor: "var(--app-border)" }}>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); dirty.current = true; }}
          placeholder="Untitled"
          className="flex-1 bg-transparent outline-none text-base font-semibold"
          style={{ color: "var(--app-text-primary)" }}
        />
        {saving && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-text-secondary)" }} />}
        <button
          onClick={() => n.togglePin(note.id, !note.pinned)}
          className="flex h-7 w-7 items-center justify-center rounded transition-colors"
          title={note.pinned ? "Unpin" : "Pin"}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
        >
          {note.pinned ? <PinOff className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} /> : <Pin className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />}
        </button>
        <button
          onClick={async () => {
            if (!confirm("Delete this note? This cannot be undone.")) return;
            await n.deleteNote(note.id);
          }}
          className="flex h-7 w-7 items-center justify-center rounded transition-colors"
          title="Delete"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
        >
          <Trash2 className="h-4 w-4" style={{ color: "#ed4245" }} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b text-xs" style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}>
        <ToolBtn label="B" bold onClick={() => exec("bold")} />
        <ToolBtn label="I" italic onClick={() => exec("italic")} />
        <ToolBtn label="U" underline onClick={() => exec("underline")} />
        <span className="mx-1 h-4 w-px" style={{ backgroundColor: "var(--app-border)" }} />
        <ToolBtn label="• List" onClick={() => exec("insertUnorderedList")} />
        <ToolBtn label="1. List" onClick={() => exec("insertOrderedList")} />
        <span className="mx-1 h-4 w-px" style={{ backgroundColor: "var(--app-border)" }} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors"
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
          Attach
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
      </div>

      <div
        ref={bodyRef}
        contentEditable
        onInput={(e) => { setBody((e.target as HTMLDivElement).innerHTML); dirty.current = true; }}
        className="flex-1 overflow-y-auto px-6 py-4 outline-none prose prose-sm max-w-none"
        style={{ color: "var(--app-text-primary)", minHeight: 0 }}
        suppressContentEditableWarning
      />

      {attachments.length > 0 && (
        <div className="border-t px-4 py-2 flex flex-wrap gap-2" style={{ borderColor: "var(--app-border)" }}>
          {attachments.map((att) => (
            <div key={att.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs" style={{ backgroundColor: "var(--app-bg-secondary)", border: "1px solid var(--app-border)" }}>
              <FileText className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
              <span style={{ color: "var(--app-text-primary)" }}>{att.name}</span>
              <span style={{ color: "var(--app-text-secondary)" }}>({formatSize(att.size)})</span>
              <button onClick={() => downloadAtt(att)} title="Download" className="ml-1">
                <Download className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
              </button>
              <button onClick={() => removeAtt(att.id)} title="Remove">
                <X className="h-3.5 w-3.5" style={{ color: "#ed4245" }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ToolBtn = ({ label, onClick, bold, italic, underline }: { label: string; onClick: () => void; bold?: boolean; italic?: boolean; underline?: boolean }) => (
  <button
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className="px-2 py-1 rounded transition-colors"
    style={{ fontWeight: bold ? 700 : undefined, fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined }}
    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--app-hover)")}
    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "")}
  >
    {label}
  </button>
);

function stripHtml(html: string) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}
function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default NotesView;
