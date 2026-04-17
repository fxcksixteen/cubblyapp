import { getNotificationPreferences } from "@/lib/notificationSettings";

/**
 * Cross-platform notification wrapper.
 * - In Electron: prefers the main-process `Notification` API (proper Windows toast
 *   attribution under our AppUserModelID).
 * - In a browser/PWA: falls back to the standard Web Notification API.
 * - Suppresses notifications when the window is focused, when DND is on, or
 *   when Gaming Mode has set `__cubblySuppress`.
 */

let permissionStatus: NotificationPermission = "default";
let dndActive = false;

if (typeof Notification !== "undefined") {
  permissionStatus = Notification.permission;
}

const electronAPI = (typeof window !== "undefined" ? (window as any).electronAPI : null) || null;
const isElectron = !!electronAPI?.isElectron;

export function setNotificationDnd(active: boolean) {
  dndActive = active;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  // Electron handles permissions natively — always allowed in main process.
  if (isElectron) return true;
  if (typeof Notification === "undefined") return false;
  if (permissionStatus === "granted") return true;
  if (permissionStatus === "denied") return false;
  try {
    const result = await Notification.requestPermission();
    permissionStatus = result;
    return result === "granted";
  } catch {
    return false;
  }
}

/** Returns the current permission state without prompting. */
export function getNotificationPermission(): NotificationPermission {
  if (isElectron) return "granted";
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

export interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  silent?: boolean;
  onClick?: () => void;
  force?: boolean;
}

const clickHandlers = new Map<string, () => void>();
if (isElectron && electronAPI?.onNotificationClick) {
  try {
    electronAPI.onNotificationClick((payload: { tag?: string }) => {
      if (!payload?.tag) return;
      const fn = clickHandlers.get(payload.tag);
      if (fn) {
        try { fn(); } catch { /* ignore */ }
      }
    });
  } catch { /* ignore */ }
}

export function notify(options: NotifyOptions) {
  const prefs = getNotificationPreferences();
  if (!prefs.desktopEnabled) return;
  if (!options.force && dndActive) return;
  if (!options.force && typeof window !== "undefined" && (window as any).__cubblySuppress) return;
  if (!options.force && typeof document !== "undefined" && document.hasFocus()) return;

  if (isElectron && electronAPI?.showNotification) {
    if (options.tag && options.onClick) clickHandlers.set(options.tag, options.onClick);
    try {
      electronAPI.showNotification({
        title: options.title,
        body: options.body,
        tag: options.tag,
        icon: options.icon,
        silent: true,
      });
    } catch (e) {
      console.warn("[notify electron] failed:", e);
    }
    return;
  }

  if (typeof Notification === "undefined") return;
  if (permissionStatus !== "granted") return;
  try {
    const n = new Notification(options.title, {
      body: options.body,
      icon: options.icon || "/favicon.ico",
      tag: options.tag,
      silent: true,
    });
    if (options.onClick) {
      n.onclick = () => {
        try {
          window.focus();
          options.onClick?.();
        } finally {
          n.close();
        }
      };
    }
  } catch (e) {
    console.warn("[notify] failed:", e);
  }
}
