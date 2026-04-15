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
});
