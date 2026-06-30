import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Lock, X, Flame, Save, Radio, Check, Loader2, PencilLine } from "lucide-react";
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
 *     "live"?:bool,                // sender's edits keep syncing
 *     "allowSave"?:bool,           // recipient may copy into their own vault
 *     "recipientCanEdit"?:bool,    // recipient can rewrite the shared copy
 *     "recipientEditUsed"?:bool,   // view-once: edit already consumed
 *     "noteId"?:string             // original note id (live sync key)
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
  recipientCanEdit?: boolean;
  recipientEditUsed?: boolean;
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
      recipientCanEdit: !!obj.recipientCanEdit,
      recipientEditUsed: !!obj.recipientEditUsed,
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
  const [, setTick] = useState(0);
  const locallySeen = useMemo(() => !!loadSeen()[messageId], [messageId, open]);
  const serverBurnt = !!payload.burnt;

  const burnt = serverBurnt || (payload.viewOnce && locallySeen && !open);

  const handleClose = async () => {
    setOpen(false);
    if (payload.viewOnce && !isOwn && !serverBurnt) {
      try { await supabase.rpc("burn_view_once_note" as any, { _message_id: messageId }); } catch {}
    }
    setTick((t) => t + 1);
  };

  const openCard = () => {
    if (burnt) return;
    // Author can still open their own card to see live recipient edits.
    if (payload.viewOnce && !isOwn) markSeen(messageId);
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
        disabled={burnt}
        className="group block w-full text-left rounded-2xl overflow-hidden transition-all disabled:cursor-default"
        style={{
          maxWidth: 380,
          backgroundColor: "#1e1f22",
          border: `1px solid ${burnt ? "#2b2d31" : "#313338"}`,
          opacity: burnt ? 0.55 : 1,
          boxShadow: burnt ? "none" : "0 1px 2px rgba(0,0,0,0.25)",
        }}
        onMouseEnter={(e) => { if (!burnt) e.currentTarget.style.borderColor = accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = burnt ? "#2b2d31" : "#313338"; }}
      >
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
            {payload.recipientCanEdit && !burnt && (
              <span className="flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#43b581" }}>
                <PencilLine className="h-3 w-3" /> EDITABLE
              </span>
            )}
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
          {!burnt && (
            <div
              className="mt-2.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: accentBg, color: accent }}
            >
              {isOwn
                ? "Tap to view"
                : payload.viewOnce
                  ? "Tap to reveal once"
                  : payload.recipientCanEdit
                    ? "Tap to open & edit"
                    : "Tap to open"}
            </div>
          )}
        </div>
      </button>

      {open && (
        <SharedNoteModal
          messageId={messageId}
          payload={payload}
          isOwn={isOwn}
          onClose={handleClose}
        />
      )}
    </>
  );
};

const SharedNoteModal = ({
  messageId, payload, isOwn, onClose,
}: {
  messageId: string;
  payload: SharedNotePayload;
  isOwn: boolean;
  onClose: () => void;
}) => {
  const canEdit =
    !isOwn &&
    !!payload.recipientCanEdit &&
    !payload.burnt &&
    !(payload.viewOnce && payload.recipientEditUsed);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState(payload.title || "");
  const [bodyDraft, setBodyDraft] = useState(payload.body || "");
  const [saving, setSaving] = useState(false);

  // Block global copy keystrokes for view-once notes.
  useEffect(() => {
    if (!payload.viewOnce) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && "cCxXaApPsS".includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "PrintScreen") e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [payload.viewOnce]);

  useEffect(() => {
    if (!payload.viewOnce) return;
    const api: any = (window as any).electronAPI;
    if (!api?.setContentProtection) return;
    try { api.setContentProtection(true); } catch {}
    return () => { try { api.setContentProtection(false); } catch {} };
  }, [payload.viewOnce]);

  const lockProps = payload.viewOnce && !editing
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

  const handleSaveEdit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("apply_recipient_note_edit" as any, {
        _message_id: messageId,
        _title: titleDraft,
        _body: bodyDraft,
      });
      if (error) throw error;
      toast.success(payload.viewOnce ? "Edit saved — one-time use consumed" : "Edit saved");
      setEditing(false);
      // Close the card right after saving a view-once edit so it can burn.
      if (payload.viewOnce) onClose();
    } catch (e: any) {
      const msg = e?.message || "Couldn't save edit";
      if (msg.includes("EDIT_NOT_ALLOWED")) toast.error("Editing was disabled by the sender");
      else if (msg.includes("EDIT_ALREADY_USED")) toast.error("View-once edit was already used");
      else if (msg.includes("NOTE_BURNT")) toast.error("Note has already been burnt");
      else toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

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
              {editing ? (
                <input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  placeholder="Untitled"
                  className="bg-transparent text-[15px] font-semibold outline-none"
                  style={{ color: "var(--app-text-primary)" }}
                />
              ) : (
                <span className="text-[15px] font-semibold truncate" style={{ color: "var(--app-text-primary)" }}>
                  {payload.title || "Untitled"}
                </span>
              )}
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

        {editing ? (
          <textarea
            value={bodyDraft}
            onChange={(e) => setBodyDraft(e.target.value)}
            placeholder="Write the new note body…"
            className="flex-1 resize-none px-5 py-5 text-[15px] leading-relaxed bg-transparent outline-none"
            style={{ color: "var(--app-text-primary)", minHeight: 220 }}
          />
        ) : (
          <div
            {...lockProps}
            className="flex-1 overflow-y-auto px-5 py-5 text-[15px] leading-relaxed whitespace-pre-wrap break-words"
            style={{ ...((lockProps as any).style || {}), color: "var(--app-text-primary)" }}
          >
            {payload.body?.trim() || "(empty)"}
          </div>
        )}

        <div className="px-5 py-3 border-t flex items-center gap-3" style={{ borderColor: "#2b2d31" }}>
          <div className="text-[11px] flex items-center gap-2 flex-1 min-w-0" style={{ color: "var(--app-text-secondary)" }}>
            {payload.viewOnce
              ? (
                <>
                  <Flame className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                  <span className="leading-snug">
                    {isOwn
                      ? "Recipient can open this once. Desktop blocks screen capture while open; web can't prevent screenshots."
                      : canEdit
                        ? "You can rewrite this once. Closing or saving will burn it for good."
                        : "Closing burns this for good. Copy & right-click are off."}
                  </span>
                </>
              )
              : payload.live
                ? (<><Radio className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} /><span>Live · updates as the sender edits.</span></>)
                : canEdit
                  ? (<><PencilLine className="h-3.5 w-3.5 shrink-0" style={{ color: "#43b581" }} /><span>Editable · your edits sync live for the sender.</span></>)
                  : <span>Shared from a personal note.</span>}
          </div>

          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors"
              style={{ backgroundColor: "#43b581", color: "white" }}
            >
              <PencilLine className="h-3 w-3" /> Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => { setEditing(false); setTitleDraft(payload.title || ""); setBodyDraft(payload.body || ""); }}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{ backgroundColor: "#2b2d31", color: "var(--app-text-primary)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
                style={{ backgroundColor: "hsl(var(--primary))", color: "white" }}
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                {saving ? "Saving…" : "Save edit"}
              </button>
            </>
          )}
          {!isOwn && !canEdit && !editing && !payload.viewOnce && payload.allowSave && (
            <SaveToNotesButton payload={payload} />
          )}
        </div>
      </div>
    </div>
  );
};

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
