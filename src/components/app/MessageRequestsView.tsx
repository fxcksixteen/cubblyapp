import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";
import inboxIcon from "@/assets/icons/messages.svg";

interface RequestRow {
  id: string;
  sender_id: string;
  preview: string | null;
  status: string;
  created_at: string;
  conversation_id: string | null;
  sender_profile?: { user_id: string; display_name: string; username: string; avatar_url: string | null } | null;
}

interface MessageRequestsViewProps {
  /** Notify parent so it can switch to the DM after accepting a request. */
  onOpenConversation?: (conversationId: string) => void;
}

/**
 * MessageRequestsView — clean sidebar-style inbox for incoming DMs
 * from non-friends. Uses the custom messages SVG (same as topbar icon)
 * for visual consistency.
 */
const MessageRequestsView = ({ onOpenConversation }: MessageRequestsViewProps) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: reqs } = await supabase
      .from("message_requests")
      .select("*")
      .eq("recipient_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    const senderIds = (reqs ?? []).map((r: any) => r.sender_id);
    let profilesMap = new Map<string, any>();
    if (senderIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url")
        .in("user_id", senderIds);
      profilesMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    }
    setRows(((reqs ?? []) as any).map((r: any) => ({ ...r, sender_profile: profilesMap.get(r.sender_id) ?? null })));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`msg-requests:${user.id}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "message_requests", filter: `recipient_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const handleAccept = async (row: RequestRow) => {
    setBusyId(row.id);
    const { data, error } = await supabase.rpc("accept_message_request", { _request_id: row.id });
    setBusyId(null);
    if (error) { toast.error("Couldn't accept request"); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    const conversationId = (data as any) || row.conversation_id;
    toast.success("Request accepted");
    if (conversationId) onOpenConversation?.(conversationId);
  };

  const handleDecline = async (row: RequestRow) => {
    setBusyId(row.id);
    const { error } = await supabase.rpc("decline_message_request", { _request_id: row.id });
    setBusyId(null);
    if (error) { toast.error("Couldn't decline request"); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: "var(--app-bg-primary)" }}>
      {/* Header removed — AppLayout topbar already shows "Message Requests" */}


      {/* Body — bordered cards like Active Now rail */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--app-text-secondary,#949ba4)" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div
              className="h-20 w-20 rounded-full flex items-center justify-center mb-4"
              style={{ backgroundColor: "var(--app-bg-secondary,#2b2d31)" }}
            >
              <img src={inboxIcon} alt="" className="h-9 w-9 invert opacity-50" />
            </div>
            <p className="text-white font-semibold text-[15px]">It's quiet in here…</p>
            <p className="text-[13px] mt-1.5 max-w-xs" style={{ color: "var(--app-text-secondary,#949ba4)" }}>
              When someone you don't know DMs you, their message will land here first so your inbox stays cozy.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-2xl">
            {rows.map((r) => {
              const p = r.sender_profile;
              const color = p ? getProfileColor(p.user_id) : defaultProfileColor;
              const initial = (p?.display_name || "?").charAt(0).toUpperCase();
              return (
                <div
                  key={r.id}
                  className="flex items-start gap-3 rounded-xl border p-3 transition-colors"
                  style={{ borderColor: "var(--app-border, #3f4147)", backgroundColor: "var(--app-bg-secondary, #2b2d31)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--app-active, #404249)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--app-bg-secondary, #2b2d31)"; }}
                >
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" />
                  ) : (
                    <div
                      className="h-11 w-11 rounded-full flex items-center justify-center font-bold text-white text-base shrink-0"
                      style={{ backgroundColor: color.bg }}
                    >
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-white leading-tight truncate">
                      {p?.display_name || "Unknown user"}
                    </p>
                    {p?.username && (
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--app-text-secondary,#949ba4)" }}>
                        @{p.username}
                      </p>
                    )}
                    {r.preview && (
                      <p className="text-[13px] mt-1.5 line-clamp-2" style={{ color: "var(--app-text-primary,#dbdee1)" }}>
                        {r.preview}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDecline(r)}
                      disabled={busyId === r.id}
                      title="Decline"
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-all disabled:opacity-60 hover:scale-105"
                      style={{ backgroundColor: "var(--app-bg-tertiary,#1e1f22)", color: "#ed4245" }}
                    >
                      <X className="h-[18px] w-[18px]" strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => handleAccept(r)}
                      disabled={busyId === r.id}
                      title="Accept"
                      className="h-9 w-9 rounded-full flex items-center justify-center transition-all disabled:opacity-60 hover:scale-105 text-white"
                      style={{ backgroundColor: "#3ba55c" }}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="h-[18px] w-[18px] animate-spin" />
                      ) : (
                        <Check className="h-[18px] w-[18px]" strokeWidth={2.5} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageRequestsView;

