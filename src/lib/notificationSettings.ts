export interface NotificationPreferences {
  desktopEnabled: boolean;
  messageSoundEnabled: boolean;
  showMessagePreview: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  desktopEnabled: true,
  messageSoundEnabled: true,
  showMessagePreview: true,
};

const STORAGE_KEY = "cubbly-notification-settings";
const CHANGE_EVENT = "cubbly:notification-settings-changed";

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_PREFERENCES;
    return {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      ...JSON.parse(raw),
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function setNotificationPreferences(next: NotificationPreferences) {
  if (typeof window === "undefined") return next;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent<NotificationPreferences>(CHANGE_EVENT, { detail: next }));
  } catch {
    // ignore persistence errors
  }

  return next;
}

export function updateNotificationPreferences(
  partial: Partial<NotificationPreferences>,
): NotificationPreferences {
  const next = {
    ...getNotificationPreferences(),
    ...partial,
  };

  return setNotificationPreferences(next);
}

export function subscribeToNotificationPreferences(
  callback: (prefs: NotificationPreferences) => void,
) {
  if (typeof window === "undefined") return () => {};

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<NotificationPreferences>;
    callback(customEvent.detail ?? getNotificationPreferences());
  };

  window.addEventListener(CHANGE_EVENT, handler as EventListener);
  return () => window.removeEventListener(CHANGE_EVENT, handler as EventListener);
}
