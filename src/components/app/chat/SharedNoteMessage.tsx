import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Lock, X } from "lucide-react";

/**
 * Shared-note message renderer.
 *
 * Wire format embedded in `messages.content`:
 *   [[cubbly:shared-note:v1]]{"title":"...","body":"...","viewOnce":true|false}
 *
 * When `viewOnce` is true, the modal:
 *  - reveals the body exactly once per recipient device (tracked in localStorage)
 *  - disables text selection, copy, drag, and the native context menu
 *  - replaces itself with a "Burnt" state on close
 */

const MARKER = "[[cubbly:shared-note:v1]]";
const SEEN_KEY = "cubbly-viewonce-notes-seen";

interface SharedNotePayload {
  title: string;
  body: string;
  viewOnce: boolean;
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
  const seen = useMemo(() => !!loadSeen()[messageId], [messageId, open]);
  const burnt = payload.viewOnce && seen && !open;

  const openCard = () => {
    if (burnt) return;
    setOpen(true);
    if (payload.viewOnce) markSeen(messageId);
  };

  return (
    <>
      <button
        type="button"
        onClick={openCard}
        disabled={burnt}
        className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed"
        style={{
          backgroundColor: burnt ? "var(--app-bg-tertiary, #1e1f22)" : "var(--app-bg-secondary, #2b2d31)",
          borderColor: "var(--app-border, #2b2d31)",
          maxWidth: 360,
          opacity: burnt ? 0.55 : 1,
        }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: payload.viewOnce ? "rgba(237,193,66,0.14)" : "rgba(88,101,242,0.14)" }}
        >
          {payload.viewOnce
            ? <Eye className="h-4 w-4" style={{ color: "#f0b132" }} />
            : <FileText className="h-4 w-4" style={{ color: "hsl(var(--primary))" }} />}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: payload.viewOnce ? "#f0b132" : "var(--app-text-secondary)" }}>
            {payload.viewOnce ? (burnt ? "View-once · opened" : "View-once note") : "Shared note"}
          </span>
          <span className="text-sm font-medium truncate" style={{ color: "var(--app-text-primary)" }}>
            {payload.title || "Untitled"}
          </span>
          <span className="text-[11px] mt-0.5" style={{ color: "var(--app-text-secondary)" }}>
            {burnt ? "This note can't be opened again" : payload.viewOnce ? "Click to open once · copy disabled" : "Click to read"}
          </span>
        </div>
      </button>

      {open && (
        <SharedNoteModal
          payload={payload}
          isOwn={isOwn}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

const SharedNoteModal = ({ payload, isOwn, onClose }: { payload: SharedNotePayload; isOwn: boolean; onClose: () => void }) => {
  // Block global copy keystrokes while a view-once note is on screen.
  useEffect(() => {
    if (!payload.viewOnce) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C" || e.key === "x" || e.key === "X" || e.key === "a" || e.key === "A")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
        },
      }
    : {};

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{ backgroundColor: "var(--app-bg-secondary)", boxShadow: "0 24px 48px rgba(0,0,0,0.5)", maxHeight: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-center gap-2 min-w-0">
            {payload.viewOnce
              ? <Eye className="h-4 w-4 shrink-0" style={{ color: "#f0b132" }} />
              : <FileText className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--primary))" }} />}
            <span className="text-sm font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
              {payload.title || "Untitled"}
            </span>
            {payload.viewOnce && (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ backgroundColor: "rgba(240,177,50,0.16)", color: "#f0b132" }}>
                <Lock className="h-3 w-3" /> view once
              </span>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--app-hover)]">
            <X className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
          </button>
        </div>

        <div
          {...lockProps}
          className="flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
        >
          {payload.body?.trim() || "(empty)"}
        </div>

        <div className="px-5 py-3 border-t text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}>
          {payload.viewOnce
            ? (isOwn ? "Recipients can only open this note once; copy is disabled on their device." : "This note is view-once. Once you close it, it can't be reopened, and copy/select is disabled.")
            : "Shared from a personal note."}
        </div>
      </div>
    </div>
  );
};

export default SharedNoteMessage;
