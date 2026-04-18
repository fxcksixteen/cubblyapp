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
  /** Tell main which desktop source the user picked for the next getDisplayMedia call. */
  setSelectedShareSource: (sourceId, wantAudio) =>
    ipcRenderer.invoke("set-selected-share-source", sourceId, wantAudio),
  clearSelectedShareSource: () => ipcRenderer.invoke("clear-selected-share-source"),
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

  // Discord-style taskbar flash
  flashFrame: () => ipcRenderer.invoke("notification-flash"),

  // Launch on system startup
  getAutoLaunch: () => ipcRenderer.invoke("auto-launch-get"),
  setAutoLaunch: (value) => ipcRenderer.invoke("auto-launch-set", value),

  // Native per-window audio capture (Windows WASAPI process loopback)
  isWindowAudioCaptureAvailable: () => ipcRenderer.invoke("is-window-audio-capture-available"),
  startWindowAudioCapture: (sourceId) => ipcRenderer.invoke("start-window-audio-capture", sourceId),
  stopWindowAudioCapture: () => ipcRenderer.invoke("stop-window-audio-capture"),
  /** Subscribes to PCM frames; returns an unsubscribe fn. */
  onWindowAudioPcm: (cb) => {
    const listener = (_e, buf) => cb(buf);
    ipcRenderer.on("window-audio-pcm", listener);
    return () => ipcRenderer.removeListener("window-audio-pcm", listener);
  },
});
