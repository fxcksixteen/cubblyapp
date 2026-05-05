import { useEffect, useState } from "react";
import { Laptop, Smartphone, Globe, LogOut, ShieldAlert, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getSessionKey, registerSession } from "@/lib/sessionTracker";
import { toast } from "sonner";
import { SettingsCard, SettingsPrimaryButton } from "./_shared";
import { formatDistanceToNow } from "date-fns";

interface DevicesSettingsProps {
  cardStyle: React.CSSProperties;
}

interface SessionRow {
  id: string;
  session_key: string;
  device_label: string;
  platform: string | null;
  is_desktop_app: boolean;
  is_mobile: boolean;
  last_seen_at: string;
  created_at: string;
}

const DevicesSettings = ({ cardStyle }: DevicesSettingsProps) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const myKey = getSessionKey();

  const load = async () => {
    if (!user) return;
    setLoading(true);
    await registerSession(user.id);
    const { data } = await supabase
      .from("user_sessions")
      .select("id, session_key, device_label, platform, is_desktop_app, is_mobile, last_seen_at, created_at")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false });
    setRows((data as SessionRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const revoke = async (row: SessionRow) => {
    if (!user) return;
    if (row.session_key === myKey) {
      toast.error("Use Log Out to sign out the current device.");
      return;
    }
    setBusy(row.id);
    const { error } = await supabase.from("user_sessions").delete().eq("id", row.id);
    setBusy(null);
    if (error) { toast.error("Couldn't sign out that device"); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success(`Signed out ${row.device_label}`);
  };

  const revokeAllOthers = async () => {
    if (!user) return;
    const others = rows.filter((r) => r.session_key !== myKey);
    if (others.length === 0) return;
    const { error } = await supabase
      .from("user_sessions")
      .delete()
      .eq("user_id", user.id)
      .neq("session_key", myKey);
    if (error) { toast.error("Couldn't sign out other devices"); return; }
    setRows((prev) => prev.filter((r) => r.session_key === myKey));
    toast.success(`Signed out ${others.length} other device${others.length === 1 ? "" : "s"}`);
  };

  const Icon = ({ row }: { row: SessionRow }) => {
    if (row.is_desktop_app) return <Laptop className="h-5 w-5" />;
    if (row.is_mobile) return <Smartphone className="h-5 w-5" />;
    return <Globe className="h-5 w-5" />;
  };

  const sorted = [...rows].sort((a, b) => {
    if (a.session_key === myKey) return -1;
    if (b.session_key === myKey) return 1;
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  const otherCount = rows.filter((r) => r.session_key !== myKey).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Every device currently signed into your Cubbly account. Revoke any you don't recognise.
        </p>
        <button
          onClick={load}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border hover:bg-white/5 shrink-0"
          style={{ borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <SettingsCard cardStyle={cardStyle}>
        {loading && rows.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--app-text-secondary)" }}>Loading sessions…</p>
        ) : sorted.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--app-text-secondary)" }}>No active sessions found.</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((row) => {
              const isCurrent = row.session_key === myKey;
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                  style={{
                    backgroundColor: "var(--app-bg-secondary)",
                    border: `1px solid ${isCurrent ? "#3ba55c" : "var(--app-border)"}`,
                  }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full shrink-0"
                      style={{ backgroundColor: "var(--app-bg-tertiary)", color: "var(--app-text-primary)" }}
                    >
                      <Icon row={row} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold truncate" style={{ color: "var(--app-text-primary)" }}>
                          {row.device_label}
                        </p>
                        {isCurrent && (
                          <span className="shrink-0 rounded-full bg-[#3ba55c] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            This device
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                        Active {formatDistanceToNow(new Date(row.last_seen_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {!isCurrent && (
                    <button
                      onClick={() => revoke(row)}
                      disabled={busy === row.id}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-[#ed4245] hover:bg-[#ed4245]/10 disabled:opacity-50 shrink-0"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SettingsCard>

      {otherCount > 0 && (
        <SettingsCard cardStyle={{ ...cardStyle, borderColor: "rgba(237, 66, 69, 0.4)" }}>
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" style={{ color: "#ed4245" }} />
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                Sign out of every other device
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--app-text-secondary)" }}>
                Useful if you lost a phone or used a public computer. Your current session stays signed in.
              </p>
              <div className="mt-3">
                <SettingsPrimaryButton onClick={revokeAllOthers}>
                  Sign out everywhere else ({otherCount})
                </SettingsPrimaryButton>
              </div>
            </div>
          </div>
        </SettingsCard>
      )}
    </div>
  );
};

export default DevicesSettings;
