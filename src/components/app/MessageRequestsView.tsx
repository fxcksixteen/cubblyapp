import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Check, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { defaultProfileColor, getProfileColor } from "@/lib/profileColors";

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
 * MessageRequestsView — inbox for incoming DMs from non-friends.
 * Accepting hands the user back into the regular DM flow; declining
 * removes the row. Subscribes to message_requests for live updates.
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
      <div className="h-12 flex items-center px-4 border-b" style={{ borderColor: "var(--app-border,#1f2024)" }}>
        <Inbox className="h-5 w-5 mr-2" style={{ color: "var(--app-text-secondary,#949ba4)" }} />
        <span className="font-bold text-white">Message Requests</span>
        {rows.length > 0 && (
          <span className="ml-2 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "var(--app-bg-tertiary,#1e1f22)", color: "var(--app-text-secondary)" }}>
            {rows.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-[var(--app-text-secondary)]" /></div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
            <Inbox className="h-12 w-12 mb-3" style={{ color: "var(--app-text-secondary,#949ba4)" }} />
            <p className="text-white font-semibold">No message requests</p>
            <p className="text-sm mt-1" style={{ color: "var(--app-text-secondary,#949ba4)" }}>
              When someone you don't know DMs you, it'll land here first.
            </p>
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--app-border,#1f2024)" }}>
            {rows.map((r) => {
              const p = r.sender_profile;
              const color = p ? getProfileColor(p.user_id) : defaultProfileColor;
              const initial = (p?.display_name || "?").charAt(0).toUpperCase();
              return (
                <li key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[var(--app-hover,#35373c)]">
                  {p?.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: color.bg }}>
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {p?.display_name || "Unknown user"}
                    </div>
                    <div className="text-[12px] truncate" style={{ color: "var(--app-text-secondary,#949ba4)" }}>
                      {r.preview || (p ? `@${p.username}` : "Wants to send you a message")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDecline(r)}
                      disabled={busyId === r.id}
                      title="Decline"
                      className="h-8 w-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-60"
                      style={{ backgroundColor: "var(--app-bg-tertiary,#1e1f22)", color: "#ed4245" }}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleAccept(r)}
                      disabled={busyId === r.id}
                      title="Accept"
                      className="h-8 w-8 rounded-md flex items-center justify-center transition-colors disabled:opacity-60 text-white"
                      style={{ backgroundColor: "#3ba55c" }}
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default MessageRequestsView;
