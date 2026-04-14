import { useState, useEffect } from "react";
import { X, Check } from "lucide-react";
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
    items: [
      { id: "activity-privacy" as SettingsCategory, label: "Activity Privacy" },
    ],
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

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const displayName = user?.user_metadata?.display_name || user?.email?.split("@")[0] || "User";
  const username = user?.user_metadata?.username || displayName.toLowerCase();

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const renderContent = () => {
    switch (activeCategory) {
      case "my-account":
        return (
          <div>
            <h2 className="text-xl font-bold text-white mb-5">My Account</h2>
            <div className="rounded-lg bg-[#1e1f22] overflow-hidden">
              {/* Banner */}
              <div className="h-[100px] bg-gradient-to-r from-[#5865f2] to-[#7289da] rounded-t-lg" />
              {/* Profile area */}
              <div className="px-4 pb-4">
                <div className="flex items-end gap-4 -mt-10">
                  <div className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-[#5865f2] border-[6px] border-[#1e1f22] text-2xl font-bold text-white shrink-0">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="pb-2">
                    <p className="font-bold text-white text-lg leading-tight">{displayName}</p>
                    <p className="text-sm text-[#949ba4]">{username}</p>
                  </div>
                </div>

                {/* Info card */}
                <div className="mt-4 rounded-lg bg-[#2b2d31] p-4">
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-0.5">Display Name</p>
                        <p className="text-sm text-[#dbdee1]">{displayName}</p>
                      </div>
                      <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#6d6f78] transition-colors">Edit</button>
                    </div>
                    <div className="h-px bg-[#3f4147]" />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-0.5">Username</p>
                        <p className="text-sm text-[#dbdee1]">{username}</p>
                      </div>
                      <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#6d6f78] transition-colors">Edit</button>
                    </div>
                    <div className="h-px bg-[#3f4147]" />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-0.5">Email</p>
                        <p className="text-sm text-[#dbdee1]">{user?.email}</p>
                      </div>
                      <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#6d6f78] transition-colors">Edit</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case "appearance":
        return (
          <div>
            <h2 className="text-xl font-bold text-white mb-5">Appearance</h2>
            <p className="text-sm text-[#949ba4] mb-6">Choose how Cubbly looks to you. Select a theme below.</p>
            
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#949ba4] mb-3">Theme</h3>
            <div className="grid grid-cols-2 gap-4">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`group relative rounded-xl border-2 p-0 overflow-hidden text-left transition-all ${
                    theme === t.id
                      ? "border-[#5865f2] ring-2 ring-[#5865f2]/30"
                      : "border-[#3f4147] hover:border-[#5865f2]/50"
                  }`}
                >
                  {/* Mini preview */}
                  <div className="flex h-[80px]">
                    <div className="w-[14px] shrink-0" style={{ backgroundColor: t.colors.tertiary }} />
                    <div className="w-[40px] shrink-0" style={{ backgroundColor: t.colors.secondary }} />
                    <div className="flex-1 p-2" style={{ backgroundColor: t.colors.primary }}>
                      <div className="h-1.5 w-10 rounded-full mb-1.5" style={{ backgroundColor: t.colors.secondary }} />
                      <div className="h-1.5 w-16 rounded-full mb-1" style={{ backgroundColor: t.colors.secondary }} />
                      <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: t.colors.secondary }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-[#1e1f22]">
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      theme === t.id ? "border-[#5865f2] bg-[#5865f2]" : "border-[#72767d]"
                    }`}>
                      {theme === t.id && <Check className="h-3 w-3 text-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white leading-tight">{t.label}</p>
                      <p className="text-[11px] text-[#949ba4]">{t.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return (
          <div>
            <h2 className="text-xl font-bold text-white mb-5">
              {settingsSections.flatMap(s => s.items).find(i => i.id === activeCategory)?.label}
            </h2>
            <p className="text-sm text-[#949ba4]">Coming soon.</p>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338]">
      <div className="flex w-full h-full">
        {/* Sidebar */}
        <div className="flex flex-1 justify-end bg-[#2b2d31] overflow-hidden">
          <nav className="w-[218px] overflow-y-auto py-[60px] pr-2 pl-5 scrollbar-thin">
            {settingsSections.map((section) => (
              <div key={section.label} className="mb-1">
                <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
                  {section.label}
                </p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`flex w-full rounded-[4px] px-2.5 py-[6px] mb-[1px] text-[15px] font-medium transition-colors ${
                      activeCategory === item.id
                        ? "bg-[#404249] text-white"
                        : "text-[#949ba4] hover:bg-[#35373c] hover:text-[#dbdee1]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}

            <div className="my-2 h-px bg-[#3f4147] mx-2" />

            <button
              onClick={handleLogout}
              className="flex w-full items-center rounded-[4px] px-2.5 py-[6px] text-[15px] font-medium text-[#f23f42] hover:bg-[#35373c] transition-colors"
            >
              Log Out
            </button>

            <div className="mt-6 px-2.5 text-[11px] text-[#4e5058]">
              Cubbly v{APP_VERSION}
            </div>
          </nav>
        </div>

        {/* Content */}
        <div className="flex flex-[1.5] bg-[#313338]">
          <div className="w-full max-w-[740px] overflow-y-auto py-[60px] px-10">
            {renderContent()}
          </div>
          {/* Close button area */}
          <div className="flex flex-col items-center pt-[60px] px-4">
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#72767d] text-[#72767d] hover:border-[#dbdee1] hover:text-[#dbdee1] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-1.5 text-[11px] font-medium text-[#72767d]">ESC</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
