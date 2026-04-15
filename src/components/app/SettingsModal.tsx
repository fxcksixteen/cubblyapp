import { useState, useEffect } from "react";
import { X, Check, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

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

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("my-account");
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!isOpen) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();
  const activeLabel = settingsSections.flatMap((section) => section.items).find((item) => item.id === activeCategory)?.label;
  const panelStyle = { backgroundColor: "var(--app-bg-secondary)", borderColor: "var(--app-border)" } as const;
  const cardStyle = { backgroundColor: "var(--app-bg-tertiary)", borderColor: "var(--app-border)" } as const;

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const renderContent = () => {
    switch (activeCategory) {
      case "my-account":
        return (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-[28px] border" style={panelStyle}>
              <div className="h-36 bg-gradient-to-r from-[#5865f2] via-[#6a73f7] to-[#f59e0b]" />
              <div className="px-6 pb-6">
                <div className="-mt-11 flex items-end gap-4">
                  <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full border-[6px] text-3xl font-bold text-white shrink-0" style={{ backgroundColor: "#5865f2", borderColor: "var(--app-bg-secondary)" }}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="pb-3">
                    <p className="text-2xl font-bold leading-tight" style={{ color: "var(--app-text-primary)" }}>{displayName}</p>
                    <p className="text-sm" style={{ color: "var(--app-text-secondary)" }}>@{username}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {[
                    { label: "Display Name", value: displayName },
                    { label: "Username", value: username },
                    { label: "Email", value: user?.email || "—" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[22px] border p-4" style={cardStyle}>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>{item.label}</p>
                      <p className="mt-2 text-sm font-semibold break-words" style={{ color: "var(--app-text-primary)" }}>{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[24px] border p-5" style={cardStyle}>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: "var(--app-text-secondary)" }}>Account Notes</p>
              <p className="mt-3 text-sm leading-6" style={{ color: "var(--app-text-secondary)" }}>
                Your theme choice is reflected inside this modal and across the entire app.
              </p>
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
                        <div className="h-10 w-10 rounded-full bg-[#5865f2]" />
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
      className="app-themed fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
      onMouseDown={onClose}
    >
      <div
        className="flex h-[min(86vh,800px)] w-full max-w-[1160px] overflow-hidden rounded-[30px] border shadow-[0_32px_90px_rgba(0,0,0,0.45)]"
        style={{ backgroundColor: "var(--app-bg-primary)", borderColor: "var(--app-border)" }}
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
                    className="mb-1 flex w-full rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors"
                    style={activeCategory === item.id
                      ? { backgroundColor: "var(--app-active)", color: "var(--app-text-primary)" }
                      : { color: "var(--app-text-secondary)" }}
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
