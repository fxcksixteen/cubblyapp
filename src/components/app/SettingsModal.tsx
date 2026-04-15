import { useState, useEffect, useRef, useCallback } from "react";
import { X, Check, LogOut, Pencil, Camera } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";
import { defaultProfileColor } from "@/lib/profileColors";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import VoiceVideoSettings from "./settings/VoiceVideoSettings";

const APP_VERSION = "0.1.0";

type SettingsCategory = "my-account" | "content-social" | "data-privacy" | "notifications" | "appearance" | "accessibility" | "voice-video" | "chat" | "keybinds" | "language-time" | "advanced" | "activity-privacy";

const settingsSections = [
  {
    label: "User Settings",
    items: [
      { id: "my-account" as SettingsCategory, label: "My Account" },
      { id: "content-social" as SettingsCategory, label: "Content & Social" },
      { id: "data-privacy" as SettingsCategory, label: "Data & Privacy" },
      { id: "notifications" as SettingsCategory, label: "Notifications" },
    ],
  },
  {
    label: "App Settings",
    items: [
      { id: "appearance" as SettingsCategory, label: "Appearance" },
      { id: "accessibility" as SettingsCategory, label: "Accessibility" },
      { id: "voice-video" as SettingsCategory, label: "Voice & Video" },
      { id: "chat" as SettingsCategory, label: "Chat" },
      { id: "keybinds" as SettingsCategory, label: "Keybinds" },
      { id: "language-time" as SettingsCategory, label: "Language & Time" },
      { id: "advanced" as SettingsCategory, label: "Advanced" },
    ],
  },
  {
    label: "Activity Settings",
    items: [{ id: "activity-privacy" as SettingsCategory, label: "Activity Privacy" }],
  },
];

const themes: { id: ThemeName; label: string; description: string; colors: { primary: string; secondary: string; tertiary: string } }[] = [
  { id: "default", label: "Default", description: "Discord-like dark theme", colors: { primary: "#313338", secondary: "#2b2d31", tertiary: "#1e1f22" } },
  { id: "onyx", label: "Onyx", description: "Full coal-black mode", colors: { primary: "#0a0a0a", secondary: "#111111", tertiary: "#000000" } },
  { id: "white", label: "Light", description: "Clean white theme", colors: { primary: "#ffffff", secondary: "#f2f3f5", tertiary: "#e3e5e8" } },
  { id: "cubbly", label: "Cubbly", description: "Warm browns with orange accents", colors: { primary: "#2a1f14", secondary: "#1e1610", tertiary: "#140e08" } },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PendingChanges {
  display_name?: string;
  username?: string;
  email?: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
}

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("my-account");
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Original profile data (source of truth)
  const [originalData, setOriginalData] = useState({
    display_name: "",
    username: "",
    email: "",
    bio: "",
    avatar_url: null as string | null,
    banner_url: null as string | null,
  });

  // Pending changes (edits not yet applied)
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const profileColor = defaultProfileColor;

  const hasChanges = Object.keys(pendingChanges).length > 0;

  // Compute current display values (original + pending)
  const currentData = {
    display_name: pendingChanges.display_name ?? originalData.display_name,
    username: pendingChanges.username ?? originalData.username,
    email: pendingChanges.email ?? originalData.email,
    bio: pendingChanges.bio ?? originalData.bio,
    avatar_url: pendingChanges.avatar_url ?? originalData.avatar_url,
    banner_url: pendingChanges.banner_url ?? originalData.banner_url,
  };

  // Fetch profile data
  useEffect(() => {
    if (!user) return;
    const dn = user.user_metadata?.display_name || user.email?.split("@")[0] || "User";
    const un = user.user_metadata?.username || dn.toLowerCase();
    supabase
      .from("profiles")
      .select("bio, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setOriginalData({
          display_name: dn,
          username: un,
          email: user.email || "",
          bio: data?.bio || "",
          avatar_url: data?.avatar_url || null,
          banner_url: null,
        });
      });
  }, [user]);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setPendingChanges({});
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimating(true));
      });
    } else {
      setAnimating(false);
      const timer = setTimeout(() => setVisible(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!visible) return null;

  const activeLabel = settingsSections.flatMap((section) => section.items).find((item) => item.id === activeCategory)?.label;
  const panelStyle = { backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" } as const;
  const cardStyle = { backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" } as const;

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  };

  const confirmEdit = () => {
    if (!editingField) return;
    const key = editingField as keyof PendingChanges;
    const origValue = originalData[key as keyof typeof originalData];
    if (editValue === origValue) {
      // No change, remove from pending
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } else {
      setPendingChanges(prev => ({ ...prev, [key]: editValue }));
    }
    setEditingField(null);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/avatar-${Date.now()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setPendingChanges(prev => ({ ...prev, avatar_url: data.publicUrl }));
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const path = `${user.id}/banner-${Date.now()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { toast.error("Upload failed"); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    setPendingChanges(prev => ({ ...prev, banner_url: data.publicUrl }));
  };

  const discardChanges = () => {
    setPendingChanges({});
    setEditingField(null);
  };

  const applyChanges = async () => {
    if (!user || !hasChanges) return;
    setSaving(true);

    try {
      // Update auth metadata if display_name or username changed
      const authUpdates: Record<string, string> = {};
      if (pendingChanges.display_name) authUpdates.display_name = pendingChanges.display_name;
      if (pendingChanges.username) authUpdates.username = pendingChanges.username;

      if (Object.keys(authUpdates).length > 0) {
        const { error } = await supabase.auth.updateUser({ data: authUpdates });
        if (error) { toast.error("Failed to update profile"); setSaving(false); return; }
      }

      // Update email separately (requires verification)
      if (pendingChanges.email) {
        const { error } = await supabase.auth.updateUser({ email: pendingChanges.email });
        if (error) { toast.error(error.message); setSaving(false); return; }
        toast.success("Verification email sent to your new address.");
      }

      // Update profiles table
      const profileUpdates: { display_name?: string; username?: string; bio?: string; avatar_url?: string } = {};
      if (pendingChanges.display_name) profileUpdates.display_name = pendingChanges.display_name;
      if (pendingChanges.username) profileUpdates.username = pendingChanges.username;
      if (pendingChanges.bio !== undefined) profileUpdates.bio = pendingChanges.bio;
      if (pendingChanges.avatar_url) profileUpdates.avatar_url = pendingChanges.avatar_url;

      if (Object.keys(profileUpdates).length > 0) {
        const { error } = await supabase.from("profiles").update(profileUpdates).eq("user_id", user.id);
        if (error) { toast.error("Failed to save changes"); setSaving(false); return; }
      }

      // Update originalData to reflect applied changes
      setOriginalData(prev => ({
        ...prev,
        ...pendingChanges,
      }));
      setPendingChanges({});
      toast.success("Changes saved!");
    } catch {
      toast.error("Something went wrong");
    }
    setSaving(false);
  };

  const accountCards = [
    { label: "Display Name", value: currentData.display_name, field: "display_name" },
    { label: "Username", value: currentData.username, field: "username" },
    { label: "Email", value: currentData.email, field: "email" },
  ];

  const renderContent = () => {
    switch (activeCategory) {
      case "my-account":
        return (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[28px] border" style={panelStyle}>
              {/* Banner with hover overlay */}
              <div
                className="h-36 relative group/banner cursor-pointer"
                style={{ background: currentData.banner_url ? `url(${currentData.banner_url}) center/cover` : profileColor.banner }}
                onClick={() => bannerInputRef.current?.click()}
              >
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/banner:opacity-100 transition-opacity flex items-center justify-center">
                  <Camera className="h-8 w-8 text-white/80" />
                </div>
                <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
              </div>

              <div className="px-6 pb-6">
                <div className="-mt-11 flex items-end gap-4">
                  {/* Avatar with hover overlay */}
                  <div
                    className="relative group/avatar cursor-pointer shrink-0"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    {currentData.avatar_url ? (
                      <img
                        src={currentData.avatar_url}
                        alt="Avatar"
                        className="h-[88px] w-[88px] rounded-full border-[6px] object-cover"
                        style={{ borderColor: "var(--app-bg-secondary)" }}
                      />
                    ) : (
                      <div
                        className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-[6px] text-3xl font-bold text-white"
                        style={{ backgroundColor: profileColor.bg, borderColor: "var(--app-bg-secondary)" }}
                      >
                        {currentData.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="h-6 w-6 text-white/80" />
                    </div>
                    <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                  <div className="pb-3">
                    <p className="text-2xl font-bold leading-tight" style={{ color: "var(--app-text-primary)" }}>{currentData.display_name}</p>
                    <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>@{currentData.username}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {accountCards.map((item) => (
                    <div key={item.label} className="rounded-[22px] border p-4 group/card relative" style={cardStyle}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>{item.label}</p>
                      {editingField === item.field ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
                            className="flex-1 rounded-lg border px-2 py-1 text-sm outline-none"
                            style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
                          />
                          <button onClick={confirmEdit} className="text-[#3ba55c] hover:text-[#2d8049]">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingField(null)} className="text-[#ed4245] hover:text-[#c03537]">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="mt-2 text-sm font-semibold break-words" style={{ color: "var(--app-text-primary)" }}>{item.value}</p>
                          <button
                            onClick={() => startEdit(item.field, item.value)}
                            className="absolute top-3 right-3 opacity-0 group-hover/card:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/10"
                          >
                            <Pencil className="h-3.5 w-3.5" style={{ color: "var(--app-text-secondary)" }} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bio Section */}
                <div className="mt-5 rounded-[22px] border p-5" style={cardStyle}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>About Me</p>
                  </div>
                  <textarea
                    value={currentData.bio}
                    onChange={(e) => {
                      const newBio = e.target.value;
                      if (newBio === originalData.bio) {
                        setPendingChanges(prev => {
                          const next = { ...prev };
                          delete next.bio;
                          return next;
                        });
                      } else {
                        setPendingChanges(prev => ({ ...prev, bio: newBio }));
                      }
                    }}
                    placeholder="Tell us about yourself..."
                    rows={4}
                    maxLength={300}
                    className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none leading-relaxed"
                    style={{ backgroundColor: "var(--app-input)", borderColor: "var(--app-border)", color: "var(--app-text-primary)" }}
                  />
                  <p className="mt-1.5 text-[11px] text-right" style={{ color: "var(--app-text-muted, var(--app-text-secondary))" }}>
                    {currentData.bio.length}/300
                  </p>
                </div>
              </div>
            </div>
          </div>
        );

      case "appearance":
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>Appearance</h2>
              <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>Pick a theme and the entire app updates live.</p>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                {themes.map((themeOption) => (
                  <button
                    key={themeOption.id}
                    onClick={() => setTheme(themeOption.id)}
                    className="group relative overflow-hidden rounded-[22px] border text-left transition-all duration-200 hover:-translate-y-0.5"
                    style={{
                      backgroundColor: "var(--app-bg-secondary)",
                      borderColor: theme === themeOption.id ? "#5865f2" : "var(--app-border)",
                      boxShadow: theme === themeOption.id ? "0 0 0 2px rgba(88, 101, 242, 0.22)" : "none",
                    }}
                  >
                    <div className="flex h-[96px]">
                      <div className="w-[14px] shrink-0" style={{ backgroundColor: themeOption.colors.tertiary }} />
                      <div className="w-[40px] shrink-0" style={{ backgroundColor: themeOption.colors.secondary }} />
                      <div className="flex flex-1 flex-col gap-2 p-3" style={{ backgroundColor: themeOption.colors.primary }}>
                        <div className="h-2 w-10 rounded-full" style={{ backgroundColor: themeOption.colors.secondary }} />
                        <div className="h-2 w-16 rounded-full" style={{ backgroundColor: themeOption.colors.secondary }} />
                        <div className="mt-auto h-9 rounded-2xl" style={{ backgroundColor: themeOption.colors.secondary }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: "var(--app-bg-tertiary)" }}>
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        theme === themeOption.id ? "border-[#5865f2] bg-[#5865f2]" : "border-[#72767d]"
                      }`}>
                        {theme === themeOption.id && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight" style={{ color: "var(--app-text-primary)" }}>{themeOption.label}</p>
                        <p className="text-[11px]" style={{ color: "var(--app-text-secondary)" }}>{themeOption.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="rounded-[24px] border p-4" style={cardStyle}>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>Live Preview</p>
                <div className="mt-4 overflow-hidden rounded-[22px] border" style={panelStyle}>
                  <div className="flex h-[260px]">
                    <div className="w-16" style={{ backgroundColor: "var(--app-bg-tertiary)" }} />
                    <div className="w-24 border-r p-3" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
                      <div className="h-3 w-14 rounded-full" style={{ backgroundColor: "var(--app-active)" }} />
                      <div className="mt-4 space-y-2">
                        <div className="h-2 rounded-full" style={{ backgroundColor: "var(--app-hover)" }} />
                        <div className="h-2 rounded-full" style={{ backgroundColor: "var(--app-hover)" }} />
                        <div className="h-2 w-3/4 rounded-full" style={{ backgroundColor: "var(--app-hover)" }} />
                      </div>
                    </div>
                    <div className="flex-1 p-4" style={{ backgroundColor: "var(--app-bg-primary)" }}>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full" style={{ backgroundColor: profileColor.bg }} />
                        <div className="space-y-2">
                          <div className="h-3 w-28 rounded-full" style={{ backgroundColor: "var(--app-active)" }} />
                          <div className="h-2 w-16 rounded-full" style={{ backgroundColor: "var(--app-hover)" }} />
                        </div>
                      </div>
                      <div className="mt-6 space-y-3">
                        <div className="h-3 rounded-full" style={{ backgroundColor: "var(--app-active)" }} />
                        <div className="h-3 w-4/5 rounded-full" style={{ backgroundColor: "var(--app-hover)" }} />
                        <div className="h-14 rounded-[18px]" style={{ backgroundColor: "var(--app-input)" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "voice-video":
        return <VoiceVideoSettings panelStyle={panelStyle as any} cardStyle={cardStyle as any} />;

      default:
        return (
          <div className="rounded-[24px] border p-5" style={cardStyle}>
            <h2 className="text-xl font-bold" style={{ color: "var(--app-text-primary)" }}>{activeLabel}</h2>
            <p className="mt-3 text-sm" style={{ color: "var(--app-text-secondary)" }}>This section is scaffolded and keeps the popup layout consistent.</p>
          </div>
        );
    }
  };

  return (
    <div
      ref={backdropRef}
      className="app-themed fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-250 ease-out"
      style={{
        backgroundColor: animating ? "rgba(0, 0, 0, 0.6)" : "rgba(0, 0, 0, 0)",
        backdropFilter: animating ? "blur(12px)" : "blur(0px)",
        WebkitBackdropFilter: animating ? "blur(12px)" : "blur(0px)",
      }}
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        className="flex h-[min(86vh,800px)] w-full max-w-[1160px] overflow-hidden rounded-[30px] border shadow-[0_32px_90px_rgba(0,0,0,0.45)] transition-all duration-250 ease-out relative"
        style={{
          backgroundColor: "var(--app-bg-primary)",
          borderColor: "var(--app-border)",
          transform: animating ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
          opacity: animating ? 1 : 0,
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <aside className="flex w-[280px] flex-shrink-0 flex-col border-r px-4 py-5" style={{ backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" }}>
          <div className="flex-1 overflow-y-auto pr-1">
            {settingsSections.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>
                  {section.label}
                </p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className="cubbly-3d-nav mb-1 flex w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150"
                    style={activeCategory === item.id
                      ? { backgroundColor: "var(--app-active)", color: "var(--app-text-primary)" }
                      : { color: "var(--app-text-secondary)" }}
                    onMouseEnter={(e) => {
                      if (activeCategory !== item.id) {
                        e.currentTarget.style.backgroundColor = "var(--app-hover)";
                        e.currentTarget.style.color = "var(--app-text-primary)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeCategory !== item.id) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--app-text-secondary)";
                      }
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="rounded-[24px] border p-3" style={cardStyle}>
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-[#f87171] transition-colors hover:bg-white/5"
            >
              Log Out
              <LogOut className="h-4 w-4" />
            </button>

            <div className="mt-3 px-3 text-[11px]" style={{ color: "var(--app-text-secondary)" }}>
              Cubbly v{APP_VERSION}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-6 py-5" style={{ borderColor: "var(--app-border)" }}>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>User Settings</p>
              <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>{activeLabel}</h1>
            </div>

            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--app-border)", color: "var(--app-text-secondary)" }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 pb-20">{renderContent()}</div>
        </div>

        {/* Unsaved changes bar */}
        <div
          className={`absolute bottom-0 left-0 right-0 flex items-center justify-between px-6 py-3.5 border-t transition-all duration-300 ease-out ${
            hasChanges ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
          }`}
          style={{
            backgroundColor: "var(--app-bg-tertiary)",
            borderColor: "var(--app-border)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.3)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--app-text-primary)" }}>
            You have unsaved changes
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={discardChanges}
              className="rounded-full px-5 py-2 text-sm font-semibold transition-colors hover:underline"
              style={{ color: "var(--app-text-secondary)" }}
            >
              Reset
            </button>
            <button
              onClick={applyChanges}
              disabled={saving}
              className="rounded-full px-5 py-2 text-sm font-semibold text-white bg-[#3ba55c] hover:bg-[#2d8b4e] transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
