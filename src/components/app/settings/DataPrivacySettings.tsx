import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { Download, Trash2, Shield, Lock, BarChart, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { SettingsCard, SettingsToggleRow, SettingsPrimaryButton } from "./_shared";

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
        [JSON.stringify({
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
        }, null, 2)],
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

  return (
    <div className="space-y-5">
      <SettingsCard cardStyle={cardStyle}>
        <SettingsToggleRow icon={<Shield className="h-5 w-5" />} title="Allow friend requests" description="Let other users send you friend requests." checked={allowFriendRequests} onChange={setAllowFriendRequests} />
        <SettingsToggleRow icon={<Lock className="h-5 w-5" />} title="Friends-only DMs" description="Only friends can start a direct message with you." checked={dmFromFriendsOnly} onChange={setDmFromFriendsOnly} />
        <SettingsToggleRow icon={<Shield className="h-5 w-5" />} title="Show my online status" description="When off, you appear offline to everyone." checked={showOnlineStatus} onChange={setShowOnlineStatus} />
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <SettingsToggleRow icon={<BarChart className="h-5 w-5" />} title="Anonymous usage analytics" description="Helps us understand which features people use. No message content ever." checked={usageAnalytics} onChange={setUsageAnalytics} />
        <SettingsToggleRow icon={<BarChart className="h-5 w-5" />} title="Crash reports" description="Send anonymized crash data so we can fix bugs faster." checked={crashReports} onChange={setCrashReports} />
        <SettingsToggleRow icon={<BarChart className="h-5 w-5" />} title="Personalized recommendations" description="Use your activity to suggest games, themes, and friends." checked={personalizedRec} onChange={setPersonalizedRec} />
      </SettingsCard>

      <SettingsCard cardStyle={cardStyle}>
        <div className="flex items-start gap-3">
          <Download className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Download my data</p>
            <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              A JSON archive with your profile, messages you've sent, friendships, inventory, and coin history.
              Personal Notes are encrypted and excluded — export them from the Notes tab instead.
            </p>
            <div className="mt-3">
              <SettingsPrimaryButton onClick={handleExport} disabled={exporting}>
                {exporting ? "Preparing…" : "Request data export"}
              </SettingsPrimaryButton>
            </div>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard cardStyle={{ ...cardStyle, borderColor: "rgba(237, 66, 69, 0.4)" }}>
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
      </SettingsCard>
    </div>
  );
};

export default DataPrivacySettings;
