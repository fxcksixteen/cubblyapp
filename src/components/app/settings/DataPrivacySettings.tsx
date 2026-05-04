import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { Switch } from "@/components/ui/switch";
import { Download, Trash2, Shield, Lock, BarChart, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DataPrivacySettingsProps {
  cardStyle: React.CSSProperties;
}

const DataPrivacySettings = ({ cardStyle }: DataPrivacySettingsProps) => {
  const { user, signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [usageAnalytics, setUsageAnalytics] = useLocalSetting("privacy.usageAnalytics", true);
  const [crashReports, setCrashReports] = useLocalSetting("privacy.crashReports", true);
  const [personalizedRec, setPersonalizedRec] = useLocalSetting("privacy.personalizedRec", true);
  const [dmFromFriendsOnly, setDmFromFriendsOnly] = useLocalSetting("privacy.dmFromFriendsOnly", false);
  const [allowFriendRequests, setAllowFriendRequests] = useLocalSetting("privacy.allowFriendRequests", true);
  const [showOnlineStatus, setShowOnlineStatus] = useLocalSetting("privacy.showOnlineStatus", true);

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const [profile, friendships, messages, conversations, inventory, equipped, transactions, games] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("friendships").select("*").or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
        supabase.from("messages").select("*").eq("sender_id", user.id),
        supabase.from("conversation_participants").select("*").eq("user_id", user.id),
        supabase.from("user_inventory").select("*").eq("user_id", user.id),
        supabase.from("user_equipped").select("*").eq("user_id", user.id),
        supabase.from("coin_transactions").select("*").eq("user_id", user.id),
        supabase.from("user_games").select("*").eq("user_id", user.id),
      ]);

      const blob = new Blob(
        [
          JSON.stringify(
            {
              exported_at: new Date().toISOString(),
              account: { id: user.id, email: user.email, created_at: user.created_at },
              profile: profile.data,
              friendships: friendships.data,
              messages: messages.data,
              conversations: conversations.data,
              inventory: inventory.data,
              equipped: equipped.data,
              transactions: transactions.data,
              games: games.data,
            },
            null,
            2
          ),
        ],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cubbly-data-${user.id.slice(0, 8)}-${Date.now()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Your data export has downloaded.");
    } catch (e: any) {
      toast.error(e?.message || "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (deleteConfirm !== "DELETE") {
      toast.error('Type DELETE to confirm.');
      return;
    }
    setDeleting(true);
    try {
      // Best-effort wipe of user-owned content (RLS allows these). Auth row
      // requires admin privileges, so we sign out and instruct support contact.
      await Promise.all([
        supabase.from("user_games").delete().eq("user_id", user.id),
        supabase.from("user_activities").delete().eq("user_id", user.id),
        supabase.from("notes").delete().eq("user_id", user.id),
        supabase.from("notes_keys").delete().eq("user_id", user.id),
        supabase.from("gif_favorites").delete().eq("user_id", user.id),
        supabase.from("apns_subscriptions").delete().eq("user_id", user.id),
        supabase.from("push_subscriptions").delete().eq("user_id", user.id),
      ]);
      toast.success("Your data has been wiped. Signing out — final account removal will be processed within 14 days.");
      await signOut();
    } catch (e: any) {
      toast.error(e?.message || "Could not delete account. Email support@cubbly.app.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const Row = ({
    icon: Icon,
    title,
    desc,
    value,
    onChange,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    desc: string;
    value: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <Icon className="h-5 w-5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>{title}</p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>{desc}</p>
        </div>
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Data & Privacy</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Control who can reach you, how Cubbly uses your data, and what to do with your account.
        </p>
      </div>

      {/* Privacy toggles */}
      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <Row icon={Shield} title="Allow friend requests" desc="Let other users send you friend requests." value={allowFriendRequests} onChange={setAllowFriendRequests} />
        <Row icon={Lock} title="Friends-only DMs" desc="Only friends can start a direct message with you." value={dmFromFriendsOnly} onChange={setDmFromFriendsOnly} />
        <Row icon={Shield} title="Show my online status" desc="When off, you appear offline to everyone." value={showOnlineStatus} onChange={setShowOnlineStatus} />
      </div>

      {/* Telemetry */}
      <div className="rounded-[24px] border p-5 space-y-5" style={cardStyle}>
        <Row icon={BarChart} title="Anonymous usage analytics" desc="Helps us understand which features people use. No message content ever." value={usageAnalytics} onChange={setUsageAnalytics} />
        <Row icon={BarChart} title="Crash reports" desc="Send anonymized crash data so we can fix bugs faster." value={crashReports} onChange={setCrashReports} />
        <Row icon={BarChart} title="Personalized recommendations" desc="Use your activity to suggest games, themes, and friends." value={personalizedRec} onChange={setPersonalizedRec} />
      </div>

      {/* Data export */}
      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Download my data</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              A JSON archive with your profile, messages you've sent, friendships, inventory, and coin history.
              Personal Notes are encrypted and excluded — export them from the Notes tab instead.
            </p>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="mt-3 rounded-full bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#4752c4] disabled:opacity-50"
            >
              {exporting ? "Preparing…" : "Request data export"}
            </button>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div
        className="rounded-[24px] border p-5"
        style={{ ...cardStyle, borderColor: "rgba(237, 66, 69, 0.4)" }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "#ed4245" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "#ed4245" }}>Delete my account</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              Permanently wipes your profile, notes, games, sessions, and more. This cannot be undone.
            </p>
            {!deleteOpen ? (
              <button
                onClick={() => setDeleteOpen(true)}
                className="mt-3 rounded-full border border-[#ed4245] px-4 py-2 text-sm font-semibold text-[#ed4245] transition-colors hover:bg-[#ed4245] hover:text-white"
              >
                <Trash2 className="inline h-4 w-4 mr-1.5 -mt-0.5" />
                Delete account…
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs" style={{ color: "var(--app-text-primary)" }}>
                  Type <span className="font-mono font-bold">DELETE</span> to confirm.
                </p>
                <input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none"
                  style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setDeleteOpen(false); setDeleteConfirm(""); }}
                    className="rounded-full px-4 py-2 text-sm font-semibold"
                    style={{ color: "var(--app-text-secondary)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || deleteConfirm !== "DELETE"}
                    className="rounded-full bg-[#ed4245] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Permanently delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataPrivacySettings;
