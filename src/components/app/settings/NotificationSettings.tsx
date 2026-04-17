import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BellRing, MessageSquareText, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { getNotificationPermission, notify } from "@/lib/notifications";
import { playSound } from "@/lib/sounds";
import {
  getNotificationPreferences,
  subscribeToNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notificationSettings";

interface NotificationSettingsProps {
  cardStyle: CSSProperties;
}

const rowStyle = {
  backgroundColor: "var(--app-bg-secondary)",
  borderColor: "var(--app-border)",
} as const;

const NotificationSettings = ({ cardStyle }: NotificationSettingsProps) => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() => getNotificationPreferences());
  const isElectron = !!(window as any).electronAPI?.isElectron;

  useEffect(() => subscribeToNotificationPreferences(setPrefs), []);

  const permissionLabel = useMemo(() => {
    if (isElectron) return "Built into the desktop app";

    const permission = getNotificationPermission();
    if (permission === "granted") return "Allowed in this browser";
    if (permission === "denied") return "Blocked in this browser";
    return "Not enabled in this browser";
  }, [isElectron]);

  const toggle = (key: keyof NotificationPreferences) => {
    setPrefs((prev) => {
      const next = updateNotificationPreferences({ [key]: !prev[key] });
      return next;
    });
  };

  const sendTestNotification = () => {
    if (!prefs.desktopEnabled) {
      toast.error("Turn on Desktop Notifications first.");
      return;
    }

    notify({
      title: "Cubbly",
      body: prefs.showMessagePreview
        ? "This is how a new message will look on your desktop."
        : "Sent you a message",
      tag: `test-notification:${Date.now()}`,
      onClick: () => {
        window.focus();
      },
    });

    toast.success("Test notification sent.");
  };

  const playTestSound = () => {
    playSound("message", { force: true });
    toast.success("Played message.wav.");
  };

  const rows = [
    {
      key: "desktopEnabled" as const,
      icon: <BellRing className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />,
      title: "Desktop Notifications",
      description: "Show native desktop alerts for new messages when Cubbly is in the background.",
    },
    {
      key: "messageSoundEnabled" as const,
      icon: <Volume2 className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />,
      title: "Message Sounds",
      description: "Play message.wav for unread incoming DMs and group messages.",
    },
    {
      key: "showMessagePreview" as const,
      icon: <MessageSquareText className="h-5 w-5" style={{ color: "var(--app-text-secondary)" }} />,
      title: "Message Previews",
      description: "Include the actual message text inside the desktop notification.",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--app-text-primary)" }}>
          Notifications
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--app-text-secondary)" }}>
          Desktop app notifications work natively — no browser popup permission nonsense required.
        </p>
      </div>

      <div className="rounded-[24px] border p-5" style={cardStyle}>
        <div className="flex items-center justify-between gap-4 rounded-[20px] border px-4 py-3" style={rowStyle}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
              Notification Status
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--app-text-secondary)" }}>
              {permissionLabel}
            </p>
          </div>
          <div
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: "var(--app-active)",
              color: "var(--app-text-primary)",
            }}
          >
            {isElectron ? "Desktop App" : "Browser"}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-4 rounded-[20px] border px-4 py-4"
              style={rowStyle}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ backgroundColor: "var(--app-active)" }}>
                {row.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: "var(--app-text-primary)" }}>
                  {row.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
                  {row.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[row.key]}
                onClick={() => toggle(row.key)}
                className="relative h-7 w-12 rounded-full border transition-colors"
                style={{
                  backgroundColor: prefs[row.key] ? "var(--app-active)" : "var(--app-bg-tertiary)",
                  borderColor: "var(--app-border)",
                }}
              >
                <span
                  className="absolute top-1 h-5 w-5 rounded-full transition-transform"
                  style={{
                    left: prefs[row.key] ? "calc(100% - 1.5rem)" : "0.25rem",
                    backgroundColor: "var(--app-text-primary)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            onClick={sendTestNotification}
            className="rounded-[18px] border px-4 py-3 text-sm font-semibold transition-colors hover:opacity-90"
            style={{
              backgroundColor: "var(--app-bg-secondary)",
              borderColor: "var(--app-border)",
              color: "var(--app-text-primary)",
            }}
          >
            Send Test Notification
          </button>
          <button
            onClick={playTestSound}
            className="rounded-[18px] border px-4 py-3 text-sm font-semibold transition-colors hover:opacity-90"
            style={{
              backgroundColor: "var(--app-bg-secondary)",
              borderColor: "var(--app-border)",
              color: "var(--app-text-primary)",
            }}
          >
            Play Test Sound
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--app-text-secondary)" }}>
          Do Not Disturb and Gaming Mode still suppress alerts automatically, even if these toggles are on.
        </p>
      </div>
    </div>
  );
};

export default NotificationSettings;
