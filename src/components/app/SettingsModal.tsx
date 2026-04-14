import { useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeName } from "@/contexts/ThemeContext";

const APP_VERSION = "0.1.0";

type SettingsCategory = "my-account" | "content-social" | "data-privacy" | "notifications" | "appearance" | "accessibility" | "voice-video" | "chat" | "keybinds" | "language-time" | "advanced" | "activity-privacy" | "logout";

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

const themes: { id: ThemeName; label: string; description: string; preview: string[] }[] = [
  { id: "default", label: "Default", description: "Discord-like dark theme", preview: ["#313338", "#2b2d31", "#1e1f22"] },
  { id: "onyx", label: "Onyx", description: "Full coal-black mode", preview: ["#0a0a0a", "#111111", "#000000"] },
  { id: "white", label: "Light", description: "Clean white theme", preview: ["#ffffff", "#f2f3f5", "#e3e5e8"] },
  { id: "cubbly", label: "Cubbly", description: "Warm browns with orange accents", preview: ["#2a1f14", "#1e1610", "#3d2a18"] },
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal = ({ isOpen, onClose }: SettingsModalProps) => {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("my-account");
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();

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
              <div className="h-24 bg-[#5865f2]" />
              <div className="px-4 pb-4">
                <div className="flex items-end gap-3 -mt-8">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#5865f2] border-[6px] border-[#1e1f22] text-2xl font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="pb-1">
                    <p className="font-bold text-white text-lg">{displayName}</p>
                    <p className="text-sm text-[#949ba4]">{username}</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-[#2b2d31] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[#949ba4]">Display Name</p>
                      <p className="text-sm text-[#dbdee1]">{displayName}</p>
                    </div>
                    <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm text-white hover:bg-[#6d6f78]">Edit</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[#949ba4]">Username</p>
                      <p className="text-sm text-[#dbdee1]">{username}</p>
                    </div>
                    <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm text-white hover:bg-[#6d6f78]">Edit</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase text-[#949ba4]">Email</p>
                      <p className="text-sm text-[#dbdee1]">{user?.email}</p>
                    </div>
                    <button className="rounded bg-[#4e5058] px-4 py-1.5 text-sm text-white hover:bg-[#6d6f78]">Edit</button>
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
            <h3 className="text-sm font-bold uppercase text-[#949ba4] mb-3">Theme</h3>
            <div className="grid grid-cols-2 gap-3">
              {themes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`rounded-lg border-2 p-3 text-left transition-all ${
                    theme === t.id
                      ? "border-[#5865f2] bg-[#5865f2]/10"
                      : "border-[#3f4147] hover:border-[#5865f2]/50 bg-[#2b2d31]"
                  }`}
                >
                  <div className="flex gap-1 mb-2">
                    {t.preview.map((color, i) => (
                      <div key={i} className="h-6 flex-1 rounded" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <p className="text-sm font-semibold text-white">{t.label}</p>
                  <p className="text-xs text-[#949ba4]">{t.description}</p>
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
    <div className="fixed inset-0 z-50 flex">
      {/* Full overlay */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative flex w-full h-full">
        {/* Sidebar */}
        <div className="flex flex-1 justify-end bg-[#2b2d31]">
          <nav className="w-[218px] overflow-y-auto py-[60px] pr-1.5 pl-5">
            {settingsSections.map((section) => (
              <div key={section.label} className="mb-2">
                <p className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#949ba4]">
                  {section.label}
                </p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveCategory(item.id)}
                    className={`flex w-full rounded px-2.5 py-1.5 text-[15px] font-medium transition-colors ${
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
            <div className="my-1 h-px bg-[#3f4147]" />
            <button
              onClick={handleLogout}
              className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-[15px] font-medium text-[#f23f42] hover:bg-[#35373c]"
            >
              Log Out
            </button>
            <div className="mt-4 px-2.5 text-[11px] text-[#4e5058]">
              Cubbly v{APP_VERSION}
            </div>
          </nav>
        </div>

        {/* Content */}
        <div className="flex flex-[1.3] bg-[#313338]">
          <div className="w-full max-w-[740px] overflow-y-auto py-[60px] px-10">
            {renderContent()}
          </div>
          {/* Close button */}
          <div className="pt-[60px] pr-5">
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#72767d] text-[#72767d] hover:border-[#dbdee1] hover:text-[#dbdee1] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="mt-1 text-center text-[11px] text-[#72767d]">ESC</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
