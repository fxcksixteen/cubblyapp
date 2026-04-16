import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getProfileColor } from "@/lib/profileColors";
import StatusIndicator from "@/components/app/StatusIndicator";
import SettingsModal from "@/components/app/SettingsModal";
import { ChevronRight, Settings, LogOut, Bell, Activity, Headphones, Palette, Shield } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { id: "online", label: "Online" },
  { id: "idle", label: "Idle" },
  { id: "dnd", label: "Do Not Disturb" },
  { id: "invisible", label: "Invisible" },
];

interface Row {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  destructive?: boolean;
}

/** Mobile-only "You" page: profile, status, settings entry. */
const YouPage = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [status, setStatus] = useState("online");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setStatus(data.status || "online");
        }
      });
  }, [user]);

  const updateStatus = async (next: string) => {
    if (!user) return;
    setStatus(next);
    const { error } = await supabase.from("profiles").update({ status: next }).eq("user_id", user.id);
    if (error) toast.error("Failed to update status");
  };

  const displayName = profile?.display_name || user?.user_metadata?.display_name || "You";
  const username = profile?.username || user?.user_metadata?.username || "user";
  const color = user ? getProfileColor(user.id) : { bg: "#5865f2" };

  const openSettings = (_section?: string) => {
    setSettingsOpen(true);
  };

  const rows: Row[] = [
    { icon: <Bell className="h-5 w-5" />, label: "Notifications", onClick: () => openSettings("notifications") },
    { icon: <Headphones className="h-5 w-5" />, label: "Voice & Video", onClick: () => openSettings("voice") },
    { icon: <Activity className="h-5 w-5" />, label: "Activity Privacy", onClick: () => openSettings("activity") },
    { icon: <Palette className="h-5 w-5" />, label: "Appearance", onClick: () => openSettings("appearance") },
    { icon: <Shield className="h-5 w-5" />, label: "Account", onClick: () => openSettings("account") },
    { icon: <Settings className="h-5 w-5" />, label: "All Settings", onClick: () => openSettings() },
  ];

  return (
    <div
      className="flex flex-col h-full overflow-y-auto pb-24"
      style={{ backgroundColor: "var(--app-bg-primary)", color: "var(--app-text-primary)" }}
    >
      {/* Banner + avatar */}
      <div className="relative">
        <div className="h-28" style={{ backgroundColor: profile?.banner_url ? undefined : color.bg, backgroundImage: profile?.banner_url ? `url(${profile.banner_url})` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="px-4 pb-4 -mt-12">
          <div className="relative inline-block">
            <div
              className="h-24 w-24 rounded-full overflow-hidden border-4 flex items-center justify-center text-3xl font-bold text-white"
              style={{ borderColor: "var(--app-bg-primary)", backgroundColor: color.bg }}
            >
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                displayName.charAt(0).toUpperCase()
              )}
            </div>
            <div className="absolute bottom-1 right-1">
              <StatusIndicator status={status} size="lg" borderColor="var(--app-bg-primary)" />
            </div>
          </div>
          <h2 className="mt-3 text-xl font-bold">{displayName}</h2>
          <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>@{username}</p>
        </div>
      </div>

      {/* Status picker */}
      <div className="px-4 mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-secondary)" }}>Status</p>
        <div className="grid grid-cols-2 gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => updateStatus(opt.id)}
              className="flex items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium touch-manipulation active:opacity-70 transition-opacity"
              style={{
                backgroundColor: status === opt.id ? "var(--app-active)" : "var(--app-bg-secondary)",
                color: "var(--app-text-primary)",
                border: `1px solid ${status === opt.id ? "hsl(var(--primary))" : "var(--app-border)"}`,
              }}
            >
              <StatusIndicator status={opt.id} size="sm" />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Settings rows */}
      <div className="px-4">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--app-text-secondary)" }}>Settings</p>
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "var(--app-bg-secondary)" }}>
          {rows.map((r, i) => (
            <button
              key={r.label}
              onClick={r.onClick}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[var(--app-hover)] touch-manipulation transition-colors"
              style={{
                borderBottom: i < rows.length - 1 ? "1px solid var(--app-border)" : undefined,
                color: r.destructive ? "#ed4245" : "var(--app-text-primary)",
              }}
            >
              <div style={{ color: r.destructive ? "#ed4245" : "var(--app-text-secondary)" }}>{r.icon}</div>
              <span className="flex-1 text-sm font-medium">{r.label}</span>
              <ChevronRight className="h-4 w-4" style={{ color: "var(--app-text-secondary)" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <div className="px-4 mt-4">
        <button
          onClick={async () => {
            await signOut();
          }}
          className="w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-semibold touch-manipulation active:opacity-70 transition-opacity"
          style={{ backgroundColor: "var(--app-bg-secondary)", color: "#ed4245", border: "1px solid var(--app-border)" }}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </button>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
};

export default YouPage;
