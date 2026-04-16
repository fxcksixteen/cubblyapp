const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

app.name = "Cubbly";

// Configure logging for the auto-updater (helps debug update issues)
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;       // Download new versions in the background
autoUpdater.autoInstallOnAppQuit = true; // Fallback: install on quit if user never restarts

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "Cubbly",
    icon: path.join(__dirname, "..", "dist", "favicon.ico"),
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#1e1610",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  Menu.setApplicationMenu(null);

  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  mainWindow.webContents.on("before-input-event", (event, input) => {
    if ((input.control || input.meta) && input.key.toLowerCase() === "r") {
      mainWindow.reload();
      event.preventDefault();
    }
    if (input.key === "F5") {
      mainWindow.reload();
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window-maximize-changed", true);
  });
  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window-maximize-changed", false);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // ----- Auto-updater wiring (only after window exists) -----
  // Forward update lifecycle events to renderer so the glassmorphism modal can react.
  autoUpdater.on("update-available", (info) => {
    log.info("[updater] update-available", info?.version);
    mainWindow?.webContents.send("update-available", { version: info?.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-progress", progress?.percent ?? 0);
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info("[updater] update-downloaded", info?.version);
    mainWindow?.webContents.send("update-downloaded", { version: info?.version });
  });
  autoUpdater.on("error", (err) => {
    log.error("[updater] error", err?.message || err);
  });

  // Initial check (silently fails if no internet / no release / dev mode)
  setTimeout(() => {
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      log.warn("[updater] initial check failed:", e?.message || e);
    }
  }, 4000);

  // Re-check every hour
  setInterval(() => {
    try {
      autoUpdater.checkForUpdates();
    } catch (e) {
      log.warn("[updater] periodic check failed:", e?.message || e);
    }
  }, 60 * 60 * 1000);
}

// IPC handlers for window controls
ipcMain.on("window-minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window-close", () => {
  mainWindow?.close();
});

ipcMain.handle("window-is-maximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

// Manual "check for updates" (e.g. wired to a Settings button later)
ipcMain.on("check-for-updates", () => {
  try {
    autoUpdater.checkForUpdates();
  } catch (e) {
    log.warn("[updater] manual check failed:", e?.message || e);
  }
});

// User clicked "Restart & Update" in the modal
ipcMain.on("install-update", () => {
  log.info("[updater] user requested install");
  autoUpdater.quitAndInstall(false, true);
});

// Desktop capturer for screen sharing
ipcMain.handle("get-desktop-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
  }));
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
