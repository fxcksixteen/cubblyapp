const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  onMaximizeChange: (callback) => {
    ipcRenderer.on("window-maximize-changed", (_, isMaximized) => callback(isMaximized));
  },
  getDesktopSources: () => ipcRenderer.invoke("get-desktop-sources"),
  isElectron: true,

  // Activity / process scanning
  getRunningProcesses: () => ipcRenderer.invoke("get-running-processes"),
  getOpenWindows: () => ipcRenderer.invoke("get-open-windows"),
  pickGameExe: () => ipcRenderer.invoke("pick-game-exe"),
  /** Returns a base64 data URL of the running process .exe / .app icon, or null. */
  getProcessIcon: (processName) => ipcRenderer.invoke("get-process-icon", processName),

  // Native desktop notifications (Windows toast / macOS NC / Linux libnotify)
  showNotification: (opts) => ipcRenderer.invoke("show-notification", opts),
  onNotificationClick: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("notification-clicked", listener);
    return () => ipcRenderer.removeListener("notification-clicked", listener);
  },

  // Auto-updater
  installUpdate: () => ipcRenderer.send("install-update"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  onUpdateAvailable: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on("update-available", listener);
    return () => ipcRenderer.removeListener("update-available", listener);
  },
  onUpdateProgress: (cb) => {
    const listener = (_e, percent) => cb(percent);
    ipcRenderer.on("update-progress", listener);
    return () => ipcRenderer.removeListener("update-progress", listener);
  },
  onUpdateDownloaded: (cb) => {
    const listener = (_e, info) => cb(info);
    ipcRenderer.on("update-downloaded", listener);
    return () => ipcRenderer.removeListener("update-downloaded", listener);
  },
  onUpdateStatus: (cb) => {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on("update-status", listener);
    return () => ipcRenderer.removeListener("update-status", listener);
  },
});
