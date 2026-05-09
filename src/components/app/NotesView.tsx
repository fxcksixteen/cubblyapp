import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useNotes, NoteRow, NotePlaintext } from "@/contexts/NotesContext";
import { Pin, PinOff, Trash2, Plus, Paperclip, ShieldCheck, Loader2, FileText, Download, X, EyeOff, ArrowLeft, KeyRound, Edit3, Copy, AlertTriangle, Play, Maximize2 } from "lucide-react";
import { toast } from "sonner";
import notesIcon from "@/assets/password-lock.svg";
import { useIsMobile } from "@/hooks/use-mobile";
import { isStandalonePWA } from "@/lib/pwa";
const ImageLightbox = lazy(() => import("@/components/app/ImageLightbox"));
const VideoLightbox = lazy(() => import("@/components/app/VideoLightbox"));
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PIN_LENGTH = 4;

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

/* ─────────── PIN dots input ─────────── */
const PinDots = ({
  value,
  onChange,
  onComplete,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <div
      className="relative flex items-center justify-center gap-4"
      onClick={() => inputRef.current?.focus()}
    >
      <input
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={value}
        maxLength={PIN_LENGTH}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
          onChange(v);
          if (v.length === PIN_LENGTH) onComplete?.(v);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label="PIN"
      />
      {Array.from({ length: PIN_LENGTH }).map((_, i) => {
        const filled = i < value.length;
        return (
          <div
            key={i}
            className="flex items-center justify-center rounded-full transition-all duration-200"
            style={{
              width: 64,
              height: 64,
              backgroundColor: filled ? "hsl(var(--primary))" : "var(--app-bg-tertiary)",
              border: `2px solid ${filled ? "hsl(var(--primary))" : "var(--app-border)"}`,
              boxShadow: filled ? "0 4px 12px hsl(var(--primary) / 0.35)" : undefined,
              transform: filled ? "scale(1.05)" : "scale(1)",
            }}
          >
            {filled && (
              <span
                className="text-2xl font-bold"
                style={{ color: "hsl(var(--primary-foreground))" }}
              >
                •
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

/* ─────────── Lock / Setup screen ─────────── */
const LockScreen = () => {
  const n = useNotes();
  const setup = !n.hasExistingVault;
  const [step, setStep] = useState<1 | 2>(1);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 450);
  };

  const handleFirstComplete = async (v: string) => {
    if (setup) {
      setStep(2);
    } else {
      setBusy(true);
      try {
        const ok = await n.unlock(v, trust);
        if (!ok) {
          triggerShake();
          setPin("");
          toast.error("Wrong PIN");
        }
      } catch (err: any) {
        triggerShake();
        setPin("");
        toast.error(err?.message || "Failed to unlock");
      } finally {
        setBusy(false);
      }
    }
  };

  const handleConfirmComplete = async (v: string) => {
    if (v !== pin) {
      triggerShake();
      setConfirmPin("");
      toast.error("PINs don't match — try again");
      return;
    }
    setBusy(true);
    try {
      await n.setupVault(pin, trust);
      toast.success("Vault created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create vault");
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    setStep(1);
    setConfirmPin("");
  };

  if (setup && step === 2) {
    return (
      <ScreenShell>
        <button
          onClick={goBack}
          className="absolute top-6 left-6 flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
          style={{ color: "var(--app-text-secondary)", marginTop: "env(safe-area-inset-top, 0px)" }}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <IconBadge />
        <h1 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>
          Confirm your PIN
        </h1>
        <p className="text-sm text-center max-w-xs" style={{ color: "var(--app-text-secondary)" }}>
          Enter the same 4 digits again to set up your personal notes.
        </p>
        <div className={shake ? "animate-shake" : ""}>
          <PinDots value={confirmPin} onChange={setConfirmPin} onComplete={handleConfirmComplete} autoFocus />
        </div>
        <TrustToggle trust={trust} setTrust={setTrust} />
        {busy && <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--app-text-secondary)" }} />}
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      <IconBadge />
      <h1 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>
        {setup ? "Create your PIN" : "Enter your PIN"}
      </h1>
      <p className="text-sm text-center max-w-xs" style={{ color: "var(--app-text-secondary)" }}>
        {setup
          ? "Choose a 4-digit PIN to protect your personal notes on this device."
          : "Enter your 4-digit PIN to unlock your personal notes."}
      </p>
      <div className={shake ? "animate-shake" : ""}>
        <PinDots value={pin} onChange={setPin} onComplete={handleFirstComplete} autoFocus />
      </div>
      <TrustToggle trust={trust} setTrust={setTrust} />
      {busy && <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--app-text-secondary)" }} />}
      <p className="text-[11px] leading-snug text-center max-w-xs" style={{ color: "var(--app-text-secondary)" }}>
        Notes are end-to-end encrypted. Forgot your PIN? Recovery is possible by personal request to Cubbly support.
      </p>
    </ScreenShell>
  );
};

const ScreenShell = ({ children }: { children: React.ReactNode }) => (
  <div
    className="relative flex flex-1 flex-col items-center justify-center gap-6 p-8"
    style={{
      backgroundColor: "var(--app-bg-primary)",
      paddingTop: "max(2rem, env(safe-area-inset-top, 0px))",
      paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))",
    }}
  >
    {children}
  </div>
);

const IconBadge = () => (
  <div
    className="flex h-16 w-16 items-center justify-center rounded-2xl"
    style={{
      backgroundColor: "var(--app-bg-secondary)",
      border: "1px solid var(--app-border)",
      boxShadow: "0 8px 24px hsl(var(--primary) / 0.15)",
    }}
  >
    <img
      src={notesIcon}
      alt=""
      className="h-8 w-8"
      style={{ filter: "invert(1) opacity(0.95)" }}
    />
  </div>
);

const TrustToggle = ({ trust, setTrust }: { trust: boolean; setTrust: (b: boolean) => void }) => (
  <label
    className="flex items-center gap-2 text-sm cursor-pointer select-none"
    style={{ color: "var(--app-text-secondary)" }}
  >
    <input
      type="checkbox"
      checked={trust}
      onChange={(e) => setTrust(e.target.checked)}
      className="accent-[hsl(var(--primary))]"
    />
    <ShieldCheck className="h-4 w-4" />
    Trust this device — skip PIN next time
  </label>
);


/* ─────────── Notes editor ─────────── */
const NotesEditor = () => {
  const n = useNotes();
  const isMobile = useIsMobile();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const active = n.notes.find((x) => x.id === activeId) || null;
  const pendingDeleteNote = n.notes.find((x) => x.id === pendingDeleteId) || null;
  const pendingDeleteTitle = pendingDeleteNote?.decrypted?.title || "Untitled";

  // On desktop, default to the first note. On mobile, start with the list.
  useEffect(() => {
    if (!isMobile && !activeId && n.notes[0]) setActiveId(n.notes[0].id);
  }, [n.notes, activeId, isMobile]);

  const create = async () => {
    const note = await n.createNote({ title: "Untitled", body: "" });
    if (note) setActiveId(note.id);
  };

  const handleDuplicate = async (note: NoteRow) => {
    if (!note.decrypted) return;
    const copy = await n.createNote({
      title: (note.decrypted.title || "Untitled") + " (copy)",
      body: note.decrypted.body || "",
    });
    if (copy) toast.success("Note duplicated");
  };

  const handleCopyText = async (note: NoteRow) => {
    if (!note.decrypted) return;
    const text = stripHtml(note.decrypted.body || "");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied note text");
    } catch {
      toast.error("Copy failed");
    }
  };

  const confirmDeleteFromList = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (activeId === id) setActiveId(null);
    await n.deleteNote(id);
  };

  const NotesList = (
    <div
      className="flex w-full md:w-72 flex-col border-r min-h-0"
      style={{ borderColor: "var(--app-border)", backgroundColor: "var(--app-bg-secondary)" }}
    >
      <div
        className="flex items-center justify-between px-3 py-3 border-b"
        style={{ borderColor: "var(--app-border)", paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <span className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Personal Notes</span>
        <div className="flex items-center gap-1">
          <button
            onClick={create}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)]"
            title="New note"
          >
            <Plus className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
          <button
            onClick={() => n.lock()}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)]"
            title="Lock vault"
          >
            <EyeOff className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
          <button
            onClick={async () => {
              await n.forgetDevice();
              toast.success("This device will require your PIN next time");
            }}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)]"
            title="Forget this device (require PIN next time)"
          >
            <KeyRound className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {n.notes.length === 0 && (
          <div className="px-4 py-6 text-xs text-center" style={{ color: "var(--app-text-secondary)" }}>
            No notes yet. Tap + to create one.
          </div>
        )}
        {n.notes.map((note) => (
          <NoteListItem
            key={note.id}
            note={note}
            active={!isMobile && note.id === activeId}
            onClick={() => setActiveId(note.id)}
            onTogglePin={() => n.togglePin(note.id, !note.pinned)}
            onDuplicate={() => handleDuplicate(note)}
            onCopyText={() => handleCopyText(note)}
            onRequestDelete={() => setPendingDeleteId(note.id)}
          />
        ))}
      </div>

      <div
        className="px-3 py-2 border-t text-[10px] flex items-center gap-1"
        style={{
          borderColor: "var(--app-border)",
          color: "var(--app-text-secondary)",
          paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        <ShieldCheck className="h-3 w-3" /> Encrypted on your device
      </div>
    </div>
  );

  const DeleteDialog = (
    <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
      <AlertDialogContent
        className="rounded-2xl border-0 p-0 overflow-hidden max-w-sm"
        style={{ backgroundColor: "var(--app-bg-secondary)", boxShadow: "0 24px 48px rgba(0,0,0,0.4)" }}
      >
        <div className="flex flex-col items-center gap-4 px-6 pt-7 pb-5">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(237,66,69,0.12)" }}
          >
            <AlertTriangle className="h-7 w-7" style={{ color: "#ed4245" }} />
          </div>
          <AlertDialogHeader className="space-y-1.5 text-center sm:text-center">
            <AlertDialogTitle className="text-lg font-bold" style={{ color: "var(--app-text-primary)" }}>
              Delete this note?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--app-text-primary)" }}>
                "{pendingDeleteTitle}"
              </span>
              <br />
              will be permanently deleted along with any attached files. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>
        <AlertDialogFooter
          className="flex-row gap-2 px-4 pb-4 pt-0 sm:gap-2"
        >
          <AlertDialogCancel
            className="flex-1 m-0 rounded-lg border-0 text-sm font-medium"
            style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)" }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDeleteFromList}
            className="flex-1 rounded-lg text-sm font-semibold bg-[#ed4245] hover:bg-[#c93b3e] text-white"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // ── MOBILE: stacked layout — list OR editor (not both) ──
  if (isMobile) {
    if (active) {
      return (
        <div className="flex flex-1 min-h-0 flex-col" style={{ backgroundColor: "var(--app-bg-primary)" }}>
          <NoteEditor note={active} key={active.id} onBack={() => setActiveId(null)} onRequestDelete={() => setPendingDeleteId(active.id)} />
          {DeleteDialog}
        </div>
      );
    }
    return (
      <div className="flex flex-1 min-h-0" style={{ backgroundColor: "var(--app-bg-primary)" }}>
        {NotesList}
        {DeleteDialog}
      </div>
    );
  }

  // ── DESKTOP: dual-pane ──
  return (
    <div className="flex flex-1 min-h-0" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {NotesList}
      <div className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <NoteEditor note={active} key={active.id} onRequestDelete={() => setPendingDeleteId(active.id)} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm" style={{ color: "var(--app-text-secondary)" }}>
            Select or create a note
          </div>
        )}
      </div>
      {DeleteDialog}
    </div>
  );
};

const NoteListItem = ({
  note,
  active,
  onClick,
  onTogglePin,
  onDuplicate,
  onCopyText,
  onRequestDelete,
}: {
  note: NoteRow;
  active: boolean;
  onClick: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onCopyText: () => void;
  onRequestDelete: () => void;
}) => {
  const title = note.decrypted?.title || (note.decryptError ? "🔒 Decryption error" : "Untitled");
  const preview = stripHtml(note.decrypted?.body || "").slice(0, 60);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          onClick={onClick}
          className="w-full text-left px-3 py-2.5 border-b transition-colors active:bg-[var(--app-hover)]"
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
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-52 rounded-xl border p-1.5 shadow-xl"
        style={{ backgroundColor: "#111214", borderColor: "var(--app-border, #2b2d31)" }}
      >
        <ContextMenuItem
          onClick={onClick}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Edit3 className="h-4 w-4" />
          Open & Edit
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onTogglePin}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {note.pinned ? "Unpin Note" : "Pin Note"}
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onDuplicate}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <FileText className="h-4 w-4" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuItem
          onClick={onCopyText}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#dbdee1] hover:bg-[#5865f2] hover:text-white cursor-pointer"
        >
          <Copy className="h-4 w-4" />
          Copy Text
        </ContextMenuItem>
        <ContextMenuSeparator className="my-1" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />
        <ContextMenuItem
          onClick={onRequestDelete}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-[#ed4245] hover:bg-[#ed4245] hover:text-white cursor-pointer"
        >
          <Trash2 className="h-4 w-4" />
          Delete Note
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const NoteEditor = ({ note, onBack, onRequestDelete }: { note: NoteRow; onBack?: () => void; onRequestDelete?: () => void }) => {
  const n = useNotes();
  // RESET state per note id (was leaking between notes before)
  const [title, setTitle] = useState(note.decrypted?.title || "");
  const [body, setBody] = useState(note.decrypted?.body || "");
  const [attachments, setAttachments] = useState(note.decrypted?.attachments || []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const latestRef = useRef({ title, body, attachments });
  latestRef.current = { title, body, attachments };

  // Initialize body HTML once per note
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.innerHTML = note.decrypted?.body || "";
    }
    setTitle(note.decrypted?.title || "");
    setBody(note.decrypted?.body || "");
    setAttachments(note.decrypted?.attachments || []);
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const flush = async () => {
    if (!dirty.current) return;
    const { title: t, body: b, attachments: a } = latestRef.current;
    try {
      await n.updateNote(note.id, { title: t, body: b, attachments: a });
      dirty.current = false;
    } catch {
      // toast handled below
    }
  };

  // Debounced autosave
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSaving(true);
      try {
        await n.updateNote(note.id, { title, body, attachments });
        dirty.current = false;
      } catch {
        toast.error("Failed to save");
      } finally {
        setSaving(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [title, body, attachments, note.id, n]);

  // Flush on unmount + before tab close (avoids losing the last 700ms of typing)
  useEffect(() => {
    const handler = () => { void flush(); };
    window.addEventListener("beforeunload", handler);
    window.addEventListener("pagehide", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
      window.removeEventListener("pagehide", handler);
      void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

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
      // iOS standalone PWAs ignore the `download` attribute — open in a new tab
      // so the user can long-press → save instead of getting nothing.
      if (isStandalonePWA()) {
        window.open(url, "_blank");
      } else {
        const a = document.createElement("a");
        a.href = url; a.download = att.name; a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
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
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{ borderColor: "var(--app-border)", paddingTop: "max(0.5rem, env(safe-area-inset-top, 0px))" }}
      >
        {onBack && (
          <button
            onClick={async () => { await flush(); onBack(); }}
            className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)] -ml-1"
            title="Back to notes"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        )}
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); dirty.current = true; }}
          placeholder="Untitled"
          autoCapitalize="sentences"
          autoCorrect="on"
          spellCheck
          className="flex-1 bg-transparent outline-none text-base font-semibold"
          style={{ color: "var(--app-text-primary)" }}
        />
        {saving && <Loader2 className="h-4 w-4 animate-spin" style={{ color: "var(--app-text-secondary)" }} />}
        <button
          onClick={() => n.togglePin(note.id, !note.pinned)}
          className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)]"
          title={note.pinned ? "Unpin" : "Pin"}
        >
          {note.pinned ? <PinOff className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} /> : <Pin className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />}
        </button>
        <button
          onClick={() => onRequestDelete?.()}
          className="flex h-8 w-8 items-center justify-center rounded transition-colors active:bg-[var(--app-hover)]"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" style={{ color: "#ed4245" }} />
        </button>
      </div>

      {/* Toolbar */}
      <div
        className="flex items-center gap-1 px-4 py-1.5 border-b text-xs overflow-x-auto"
        style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}
      >
        <ToolBtn label="B" bold onClick={() => exec("bold")} />
        <ToolBtn label="I" italic onClick={() => exec("italic")} />
        <ToolBtn label="U" underline onClick={() => exec("underline")} />
        <span className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: "var(--app-border)" }} />
        <ToolBtn label="• List" onClick={() => exec("insertUnorderedList")} />
        <ToolBtn label="1. List" onClick={() => exec("insertOrderedList")} />
        <span className="mx-1 h-4 w-px shrink-0" style={{ backgroundColor: "var(--app-border)" }} />
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors active:bg-[var(--app-hover)] shrink-0"
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
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
        onInput={(e) => { setBody((e.target as HTMLDivElement).innerHTML); dirty.current = true; }}
        className="flex-1 overflow-y-auto px-6 py-4 outline-none prose prose-sm max-w-none"
        style={{ color: "var(--app-text-primary)", minHeight: 0, WebkitUserSelect: "text" }}
        suppressContentEditableWarning
      />

      {attachments.length > 0 && (
        <div
          className="border-t px-4 py-2 flex flex-wrap gap-2"
          style={{ borderColor: "var(--app-border)", paddingBottom: "max(0.5rem, env(safe-area-inset-bottom, 0px))" }}
        >
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
    onTouchStart={(e) => { e.preventDefault(); onClick(); }}
    className="px-2 py-1 rounded transition-colors active:bg-[var(--app-hover)] shrink-0"
    style={{ fontWeight: bold ? 700 : undefined, fontStyle: italic ? "italic" : undefined, textDecoration: underline ? "underline" : undefined }}
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
