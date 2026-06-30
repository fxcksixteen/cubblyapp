import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useLocalSetting } from "@/hooks/useLocalSetting";
import { Download, Trash2, Shield, BarChart, AlertTriangle, Users, Gift } from "lucide-react";
import { toast } from "sonner";
import { SettingsCard, SettingsToggleRow, SettingsPrimaryButton } from "./_shared";

interface DataPrivacySettingsProps {
  cardStyle: React.CSSProperties;
}

type WhoCanDM = "everyone" | "friends_of_friends" | "friends_only";

const WHO_OPTIONS: { id: WhoCanDM; label: string; desc: string }[] = [
  { id: "everyone", label: "Everyone", desc: "Anyone on Cubbly can send you a DM." },
  { id: "friends_of_friends", label: "Friends of friends", desc: "Only friends and people who share a mutual friend." },
  { id: "friends_only", label: "Friends only", desc: "Strangers will land in your Message Requests." },
];

const DataPrivacySettings = ({ cardStyle }: DataPrivacySettingsProps) => {
  const { user, signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [usageAnalytics, setUsageAnalytics] = useLocalSetting("privacy.usageAnalytics", true);
  const [crashReports, setCrashReports] = useLocalSetting("privacy.crashReports", true);
  const [personalizedRec, setPersonalizedRec] = useLocalSetting("privacy.personalizedRec", true);
  const [allowFriendRequests, setAllowFriendRequests] = useLocalSetting("privacy.allowFriendRequests", true);
  const [showOnlineStatus, setShowOnlineStatus] = useLocalSetting("privacy.showOnlineStatus", true);

  const [whoCanDm, setWhoCanDm] = useState<WhoCanDM>("everyone");
  const [savingWho, setSavingWho] = useState<WhoCanDM | null>(null);

  // Hydrate the user's current who_can_dm preference from dm_preferences.
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (supabase as any).from("dm_preferences")
      .select("who_can_dm")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { who_can_dm?: string } | null }) => {
        if (!alive) return;
        const v = (data?.who_can_dm as WhoCanDM) || "everyone";
        if (["everyone", "friends_of_friends", "friends_only"].includes(v)) setWhoCanDm(v);
      });
    return () => { alive = false; };
  }, [user]);

  const handleWhoChange = async (next: WhoCanDM) => {
    if (!user || next === whoCanDm) return;
    setSavingWho(next);
    const prev = whoCanDm;
    setWhoCanDm(next);
    const { error } = await (supabase as any).from("dm_preferences").upsert(
      { user_id: user.id, who_can_dm: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    setSavingWho(null);
    if (error) {
      setWhoCanDm(prev);
      toast.error("Couldn't save DM preference");
    } else {
      toast.success("DM privacy updated");
    }
  };

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
        <SettingsToggleRow icon={<Shield className="h-5 w-5" />} title="Show my online status" description="When off, you appear offline to everyone." checked={showOnlineStatus} onChange={setShowOnlineStatus} />

        <div className="pt-4 border-t" style={{ borderColor: "var(--app-border)" }}>
          <div className="flex items-start gap-3 mb-3">
            <Users className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "var(--app-text-secondary)" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>Who can send me direct messages</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                Anyone you block this way will land in your Message Requests instead. You'll never miss a message — you just decide who skips the filter.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {WHO_OPTIONS.map((opt) => {
              const active = whoCanDm === opt.id;
              const busy = savingWho === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleWhoChange(opt.id)}
                  disabled={busy}
                  className="text-left rounded-lg p-3 transition-all disabled:opacity-60"
                  style={{
                    backgroundColor: active ? "rgba(88,101,242,0.15)" : "var(--app-bg-tertiary)",
                    border: `1px solid ${active ? "#5865f2" : "var(--app-border)"}`,
                  }}
                >
                  <p className="text-sm font-bold" style={{ color: active ? "#5865f2" : "var(--app-text-primary)" }}>{opt.label}</p>
                  <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--app-text-secondary)" }}>{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
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
