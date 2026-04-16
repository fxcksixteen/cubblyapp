/**
 * Native OS notifications wrapper.
 * - Works in both web and Electron (Electron provides the same Notification API
 *   in renderer when the app is focused-aware).
 * - Respects DND state via lib/sounds isDndActive() (passed in to keep this
 *   module dependency-free).
 * - Suppresses notifications when the window is focused (user is already there).
 */

let permissionStatus: NotificationPermission = "default";
let dndActive = false;

if (typeof Notification !== "undefined") {
  permissionStatus = Notification.permission;
}

export function setNotificationDnd(active: boolean) {
  dndActive = active;
}

export async function ensureNotificationPermission(): Promise<boolean> {
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

export interface NotifyOptions {
  title: string;
  body: string;
  icon?: string;
  tag?: string; // collapses repeated notifications (e.g. same conversation)
  silent?: boolean;
  onClick?: () => void;
}

export function notify(options: NotifyOptions) {
  if (typeof Notification === "undefined") return;
  if (permissionStatus !== "granted") return;
  if (dndActive) return;
  // Don't disturb when the window is already focused
  if (typeof document !== "undefined" && document.hasFocus()) return;

  try {
    const n = new Notification(options.title, {
      body: options.body,
      icon: options.icon || "/favicon.ico",
      tag: options.tag,
      silent: options.silent ?? false,
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
