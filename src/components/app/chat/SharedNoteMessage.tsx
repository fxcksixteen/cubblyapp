import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Lock, X, Flame, Save, Radio, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNotes } from "@/contexts/NotesContext";
import { toast } from "sonner";

/**
 * Shared-note message renderer.
 *
 * Wire format embedded in `messages.content`:
 *   [[cubbly:shared-note:v1]]{
 *     "title":"...","body":"...",
 *     "viewOnce":bool,"burnt"?:bool,
 *     "live"?:bool,        // sender's edits keep syncing (last-write-wins)
 *     "allowSave"?:bool,   // recipient may copy into their own vault
 *     "noteId"?:string     // original note id, used for live sync
 *   }
 */

const MARKER = "[[cubbly:shared-note:v1]]";
const SEEN_KEY = "cubbly-viewonce-notes-seen";
const SAVED_KEY = "cubbly-shared-notes-saved";

interface SharedNotePayload {
  title: string;
  body: string;
  viewOnce: boolean;
  burnt?: boolean;
  live?: boolean;
  allowSave?: boolean;
  noteId?: string;
}

export const parseSharedNote = (raw: string): SharedNotePayload | null => {
  if (!raw || !raw.startsWith(MARKER)) return null;
  try {
    const json = raw.slice(MARKER.length).trim();
    const obj = JSON.parse(json);
    if (typeof obj?.title !== "string" || typeof obj?.body !== "string") return null;
    return {
      title: obj.title,
      body: obj.body,
      viewOnce: !!obj.viewOnce,
      burnt: !!obj.burnt,
      live: !!obj.live,
      allowSave: !!obj.allowSave,
      noteId: typeof obj.noteId === "string" ? obj.noteId : undefined,
    };
  } catch {
    return null;
  }
};

const loadSeen = (): Record<string, number> => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") || {}; }
  catch { return {}; }
};
const markSeen = (id: string) => {
  try {
    const m = loadSeen();
    m[id] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {}
};

interface Props {
  messageId: string;
  payload: SharedNotePayload;
  isOwn: boolean;
}

const SharedNoteMessage = ({ messageId, payload, isOwn }: Props) => {
  const [open, setOpen] = useState(false);
  // Bump when the modal closes so we re-read the seen flag.
  const [, setTick] = useState(0);
  const locallySeen = useMemo(() => !!loadSeen()[messageId], [messageId, open]);
  const serverBurnt = !!payload.burnt;

  // For the recipient the note becomes inert once it's been opened OR once the
  // sender's server-side copy was burnt. The sender always sees an
  // un-clickable preview chip so they can see what they sent.
  const burnt = serverBurnt || (payload.viewOnce && locallySeen && !open);

  const handleClose = async () => {
    setOpen(false);
    if (payload.viewOnce && !isOwn && !serverBurnt) {
      // Best-effort: burn server-side. If it fails (offline, etc.) the
      // localStorage flag still prevents re-opening on this device.
      try { await supabase.rpc("burn_view_once_note" as any, { _message_id: messageId }); } catch {}
    }
    setTick((t) => t + 1);
  };

  const openCard = () => {
    if (burnt || isOwn) return;
    if (payload.viewOnce) markSeen(messageId);
    setOpen(true);
  };

  const accent = payload.viewOnce ? "#f0b132" : "hsl(var(--primary))";
  const accentBg = payload.viewOnce ? "rgba(240,177,50,0.12)" : "rgba(88,101,242,0.14)";
  const previewBody = payload.viewOnce
    ? "Tap to reveal — opens only once"
    : (payload.body?.trim().slice(0, 140) || "(empty note)");

  return (
    <>
      <button
        type="button"
        onClick={openCard}
        disabled={burnt || isOwn}
        className="group block w-full text-left rounded-2xl overflow-hidden transition-all disabled:cursor-default"
        style={{
          maxWidth: 380,
          backgroundColor: "#1e1f22",
          border: `1px solid ${burnt ? "#2b2d31" : "#313338"}`,
          opacity: burnt ? 0.55 : 1,
          boxShadow: burnt ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
        }}
        onMouseEnter={(e) => { if (!burnt && !isOwn) e.currentTarget.style.borderColor = accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = burnt ? "#2b2d31" : "#313338"; }}
      >
        {/* Accent header strip */}
        <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: accentBg }}>
          {burnt
            ? <Flame className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
            : payload.viewOnce
              ? <Eye className="h-3.5 w-3.5" style={{ color: accent }} />
              : <FileText className="h-3.5 w-3.5" style={{ color: accent }} />}
          <span
            className="text-[10.5px] font-bold uppercase tracking-wider"
            style={{ color: burnt ? "var(--app-text-secondary)" : accent }}
          >
            {burnt
              ? "Note · burnt"
              : payload.viewOnce
                ? (isOwn ? "View-once note · sent" : "View-once note")
                : "Shared note"}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            {payload.live && !burnt && (
              <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
                <Radio className="h-3 w-3" /> LIVE
              </span>
            )}
            {payload.viewOnce && !burnt && (
              <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>
                <Lock className="h-3 w-3" /> 1×
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-3.5 py-3">
          <div className="text-[15px] font-semibold leading-snug truncate" style={{ color: "var(--app-text-primary)" }}>
            {payload.title || "Untitled"}
          </div>
          <div
            className={`mt-1 text-[12.5px] leading-snug ${payload.viewOnce && !burnt ? "italic" : ""}`}
            style={{
              color: "var(--app-text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              // Blur the body for view-once notes so a quick scroll doesn't
              // leak the contents before the recipient opens it.
              filter: payload.viewOnce && !burnt && !isOwn ? "blur(6px)" : undefined,
              userSelect: payload.viewOnce ? "none" : undefined,
            }}
          >
            {burnt
              ? "This note can't be opened again."
              : payload.viewOnce && !isOwn
                ? "•••••• •••• ••••• •••"
                : previewBody}
          </div>
          {!burnt && !isOwn && (
            <div
              className="mt-2.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: accentBg, color: accent }}
            >
              {payload.viewOnce ? "Tap to reveal once" : "Tap to open"}
            </div>
          )}
        </div>
      </button>

      {open && (
        <SharedNoteModal payload={payload} isOwn={isOwn} onClose={handleClose} />
      )}
    </>
  );
};

const SharedNoteModal = ({ payload, isOwn, onClose }: { payload: SharedNotePayload; isOwn: boolean; onClose: () => void }) => {
  // Block global copy keystrokes while a view-once note is on screen.
  useEffect(() => {
    if (!payload.viewOnce) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X" || e.key === "a" || e.key === "A" || e.key === "p" || e.key === "P" || e.key === "s" || e.key === "S")) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "PrintScreen") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [payload.viewOnce]);

  // v0.3.21: enable Electron native content-protection while a view-once note
  // is on screen so external screenshot tools (Lightshot, Snipping Tool, OBS,
  // Discord screenshare, etc.) capture only a black window. No-op on web.
  useEffect(() => {
    if (!payload.viewOnce) return;
    const api: any = (window as any).electronAPI;
    if (!api?.setContentProtection) return;
    try { api.setContentProtection(true); } catch {}
    return () => { try { api.setContentProtection(false); } catch {} };
  }, [payload.viewOnce]);

  const lockProps = payload.viewOnce
    ? {
        onCopy: (e: React.ClipboardEvent) => { e.preventDefault(); },
        onCut: (e: React.ClipboardEvent) => { e.preventDefault(); },
        onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); },
        onDragStart: (e: React.DragEvent) => { e.preventDefault(); },
        style: {
          userSelect: "none" as const,
          WebkitUserSelect: "none" as const,
          MozUserSelect: "none" as const,
          WebkitTouchCallout: "none" as const,
        },
      }
    : {};

  const accent = payload.viewOnce ? "#f0b132" : "hsl(var(--primary))";
  const accentBg = payload.viewOnce ? "rgba(240,177,50,0.12)" : "rgba(88,101,242,0.14)";

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "#1e1f22", boxShadow: "0 24px 56px rgba(0,0,0,0.6)", maxHeight: "85vh", border: "1px solid #2b2d31" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#2b2d31" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: accentBg }}>
              {payload.viewOnce
                ? <Eye className="h-4 w-4" style={{ color: accent }} />
                : <FileText className="h-4 w-4" style={{ color: accent }} />}
            </div>
            <div className="min-w-0 flex flex-col">
              <span className="text-[15px] font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                {payload.title || "Untitled"}
              </span>
              <span className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
                {payload.viewOnce ? "View-once · closing will permanently burn this note" : "Shared note"}
              </span>
            </div>
            {payload.viewOnce && (
              <span
                className="ml-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0"
                style={{ backgroundColor: accentBg, color: accent }}
              >
                <Lock className="h-3 w-3" /> 1×
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-[var(--app-hover)]">
            <X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        </div>

        <div
          {...lockProps}
          className="flex-1 overflow-y-auto px-5 py-5 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
          style={{ ...((lockProps as any).style || {}), color: "var(--app-text-primary)" }}
        >
          {payload.body?.trim() || "(empty)"}
        </div>

        <div className="px-5 py-3 border-t flex items-center gap-3" style={{ borderColor: "#2b2d31" }}>
          <div className="text-[11px] flex items-center gap-2 flex-1 min-w-0" style={{ color: "var(--app-text-secondary)" }}>
            {payload.viewOnce
              ? (
                <>
                  <Flame className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                  <span className="leading-snug">
                    {isOwn
                      ? "Recipient can open this once. On desktop, the app blocks screen-capture tools while it's open; on web, screenshots can't be prevented."
                      : "Closing burns this for good. Copy, select & right-click are off. On the desktop app, screenshot tools see only a black window."}
                  </span>
                </>
              )
              : payload.live
                ? (<><Radio className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} /><span>Live · updates as the sender edits.</span></>)
                : <span>Shared from a personal note.</span>}
          </div>
          {!isOwn && !payload.viewOnce && payload.allowSave && (
            <SaveToNotesButton payload={payload} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * "Save to my notes" — appears on the recipient side of any non-view-once
 * shared note where the sender enabled `allowSave`. We dedupe per device via
 * localStorage so the button can't be tapped twice to spam the vault.
 */
const SaveToNotesButton = ({ payload }: { payload: SharedNotePayload }) => {
  const notes = useNotes();
  const savedKey = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "{}") as Record<string, number>; }
    catch { return {}; }
  }, []);
  const dedupeId = `${payload.noteId || ""}::${payload.title}::${payload.body.length}`;
  const [saved, setSaved] = useState<boolean>(!!savedKey[dedupeId]);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    if (saved || busy) return;
    setBusy(true);
    try {
      const row = await notes.createNote({
        title: payload.title || "Shared note",
        body: payload.body || "",
      });
      if (!row) {
        toast.error("Unlock your notes vault first");
        return;
      }
      try {
        const map = JSON.parse(localStorage.getItem(SAVED_KEY) || "{}") || {};
        map[dedupeId] = Date.now();
        localStorage.setItem(SAVED_KEY, JSON.stringify(map));
      } catch {}
      setSaved(true);
      toast.success("Saved to your notes");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={onSave}
      disabled={saved || busy}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors disabled:opacity-60"
      style={{ backgroundColor: saved ? "#2b2d31" : "hsl(var(--primary))", color: saved ? "var(--app-text-secondary)" : "white" }}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : saved ? <Check className="h-3 w-3" /> : <Save className="h-3 w-3" />}
      {saved ? "Saved" : busy ? "Saving…" : "Save to my notes"}
    </button>
  );
};

export default SharedNoteMessage;
