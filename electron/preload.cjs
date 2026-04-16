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
  pickGameExe: () => ipcRenderer.invoke("pick-game-exe"),

  // Auto-updater
  installUpdate: () => ipcRenderer.send("install-update"),
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  onUpdateAvailable: (cb) => {
    const listener = () => cb();
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
});
