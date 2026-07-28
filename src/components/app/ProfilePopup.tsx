import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Copy, Pencil, User, Check, Smile } from "lucide-react";
import CustomStatusModal from "@/components/app/CustomStatusModal";
import { toast } from "sonner";
import { defaultProfileColor } from "@/lib/profileColors";
import StatusIndicator from "@/components/app/StatusIndicator";
import UserDisplayName from "@/components/app/UserDisplayName";
import UserBadges from "@/components/app/UserBadges";

const statuses = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "invisible", label: "Invisible" },
] as const;

interface ProfilePopupProps {
  currentStatus: string;
  onStatusChange: (status: string) => void;
  onOpenSettings: () => void;
}

const ProfilePopup = ({ currentStatus, onStatusChange, onOpenSettings }: ProfilePopupProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [customStatusOpen, setCustomStatusOpen] = useState(false);
  const [customStatus, setCustomStatus] = useState<{ text: string; emoji: string | null; expires_at: string | null } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();
  const profileColor = defaultProfileColor;

  // Pull the live avatar + banner the user actually has on now, not whatever
  // they had when they first signed up. Also subscribe to changes so it
  // refreshes immediately after they edit their profile.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("avatar_url, banner_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAvatarUrl((data as any).avatar_url || null);
        setBannerUrl((data as any).banner_url || null);
      });
    const channel = supabase
      .channel(`profile-popup:${user.id}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as { avatar_url?: string | null; banner_url?: string | null };
          setAvatarUrl(next.avatar_url || null);
          setBannerUrl(next.banner_url || null);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Load any active custom status so we can show it inline and let the user clear it.
  useEffect(() => {
    if (!user) { setCustomStatus(null); return; }
    let alive = true;
    supabase.from("custom_statuses")
      .select("text, emoji, expires_at")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        if (!data?.text && !data?.emoji) { setCustomStatus(null); return; }
        if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) { setCustomStatus(null); return; }
        setCustomStatus({ text: data.text || "", emoji: (data as any).emoji ?? null, expires_at: (data as any).expires_at ?? null });
      });
    return () => { alive = false; };
  }, [user, customStatusOpen]);

  // Live-tick: when the active custom status passes its expires_at, clear it
  // immediately without requiring a reload or popup reopen.
  useEffect(() => {
    if (!customStatus?.expires_at) return;
    const expiresAt = new Date(customStatus.expires_at).getTime();
    const msLeft = expiresAt - Date.now();
    if (msLeft <= 0) { setCustomStatus(null); return; }
    const t = setTimeout(() => setCustomStatus(null), msLeft + 250);
    return () => clearTimeout(t);
  }, [customStatus?.expires_at]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleStatusSelect = async (status: string) => {
    onStatusChange(status);
    if (user) {
      await supabase.from("profiles").update({ status }).eq("user_id", user.id);
    }
  };

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id);
      setCopied(true);
      toast.success("User ID copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const currentStatusObj = statuses.find(s => s.value === currentStatus) || statuses[0];

  // The panel is portalled out of `.user-panel`, which several themes render
  // translucent (backdrop blur). Rendering it at the themed root keeps the menu
  // fully opaque on every theme while still inheriting the theme variables.
  const portalRoot = typeof document !== "undefined"
    ? (document.querySelector(".app-themed") as HTMLElement | null) ?? document.body
    : null;
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    setOpen((v) => !v);
  };

  const panel = open && portalRoot ? createPortal(
        <div
          ref={panelRef}
          className="cb-solid-surface fixed w-[420px] rounded-xl shadow-2xl border z-[200] overflow-hidden"
          style={{
            borderColor: "var(--app-border, #2b2d31)",
            left: Math.max(8, anchor?.left ?? 8),
            bottom: anchor?.bottom ?? 8,
          }}
        >
          {/* Banner */}
          <div className="h-[140px]" style={{ background: bannerUrl ? `url(${bannerUrl}) center/cover no-repeat` : profileColor.banner }} />



          {/* Avatar */}
          <div className="px-4 -mt-11 relative z-10">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-[88px] w-[88px] rounded-full border-[6px] object-cover" style={{ borderColor: "var(--app-bg-secondary, #111214)" }} />
            ) : (
              <div
                className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-[6px] text-3xl font-bold text-white"
                style={{ backgroundColor: profileColor.bg, borderColor: "var(--app-bg-secondary, #111214)" }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>


          {/* Info */}
          <div className="px-4 pt-2 pb-4">
            <p className="text-xl font-bold text-white flex items-center gap-2">
              <UserDisplayName userId={user?.id} name={displayName} fallbackColor="#ffffff" />
              <UserBadges userId={user?.id} size={16} withTooltip />
            </p>
            <p className="text-[13px] mt-0.5" style={{ color: "var(--app-text-secondary, #949ba4)" }}>{username}</p>
            {customStatus && (customStatus.text || customStatus.emoji) && (
              <p className="text-[12px] mt-1.5 truncate flex items-center gap-1" style={{ color: "var(--app-text-primary, #dbdee1)" }}>
                {customStatus.emoji && <span>{customStatus.emoji}</span>}
                {customStatus.text && <span className="truncate">{customStatus.text}</span>}
              </p>
            )}
          </div>

          <div className="mx-3 h-px" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />

          {/* Actions */}
          <div className="p-2">
            <p className="px-2 pt-1 pb-1 text-[11px] font-bold uppercase" style={{ color: "var(--app-text-secondary, #949ba4)" }}>Status</p>
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => handleStatusSelect(s.value)}
                className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors"
                style={{
                  backgroundColor: currentStatus === s.value ? "var(--app-active, #404249)" : undefined,
                  color: currentStatus === s.value ? "white" : "var(--app-text-primary, #dbdee1)",
                }}
                onMouseEnter={e => { if (currentStatus !== s.value) e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
                onMouseLeave={e => { if (currentStatus !== s.value) e.currentTarget.style.backgroundColor = ""; }}
              >
                <StatusIndicator status={s.value} size="sm" borderColor="var(--app-bg-tertiary, #111214)" />
                {s.label}
              </button>
            ))}

            <div className="my-1.5 h-px" style={{ backgroundColor: "var(--app-border, #2b2d31)" }} />

            <button
              onClick={() => { setOpen(false); setCustomStatusOpen(true); }}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors"
              style={{ color: "var(--app-text-primary, #dbdee1)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
            >
              <Smile className="h-4 w-4" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
              {customStatus ? "Edit custom status" : "Set a custom status"}
            </button>

            <button
              onClick={() => { setOpen(false); onOpenSettings(); }}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors"
              style={{ color: "var(--app-text-primary, #dbdee1)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
            >
              <Pencil className="h-4 w-4" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
              Edit Profile
            </button>
            <button
              onClick={handleCopyId}
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors"
              style={{ color: "var(--app-text-primary, #dbdee1)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
            >
              {copied ? <Check className="h-4 w-4 text-[#3ba55c]" /> : <Copy className="h-4 w-4" style={{ color: "var(--app-text-secondary, #949ba4)" }} />}
              {copied ? "Copied!" : "Copy User ID"}
            </button>
            <button
              className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-sm transition-colors"
              style={{ color: "var(--app-text-primary, #dbdee1)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--app-hover, #35373c)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = ""; }}
            >
              <User className="h-4 w-4" style={{ color: "var(--app-text-secondary, #949ba4)" }} />
              View Profile
            </button>
          </div>
        </div>
      )}
      <CustomStatusModal
        open={customStatusOpen}
        onClose={() => setCustomStatusOpen(false)}
        onSaved={(s) => setCustomStatus(s ? { text: s.text, emoji: s.emoji, expires_at: s.expires_at } : null)}
      />
    </div>
  );
};

export default ProfilePopup;
