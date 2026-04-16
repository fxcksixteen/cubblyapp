const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, dialog } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

app.name = "Cubbly";

// Configure logging for the auto-updater (helps debug update issues)
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;       // Download new versions in the background
autoUpdater.autoInstallOnAppQuit = true; // Fallback: install on quit if user never restarts

// ----- Auto-launch on system startup (Discord-style) -----
// Enabled by default for every install. Users can disable it later via Settings
// (we'll wire that to a setting in a future build). On macOS this uses Login
// Items; on Windows it adds a registry key under HKCU\...\Run; Linux is a
// no-op because each distro handles startup differently.
// ----- Auto-launch on system startup (Discord-style) -----
// Fires only on OS login/reboot, NOT after a manual close.
try {
  if (process.platform === "win32" || process.platform === "darwin") {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: false,
      path: process.execPath,
    });
  }
} catch (e) {
  log.warn("[startup] failed to configure login item:", e?.message || e);
}

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

// ----- Activity / Process scanner -----
// Returns a list of running process names (lowercase, without .exe) currently on the system.
// Used by the renderer to detect "Playing X" activity.
function listRunningProcesses() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      // tasklist is preinstalled on every Windows install
      exec('tasklist /fo csv /nh', { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve([]);
        const names = new Set();
        stdout.split(/\r?\n/).forEach(line => {
          const match = line.match(/^"([^"]+)"/);
          if (match) {
            const name = match[1].toLowerCase().replace(/\.exe$/, "");
            if (name) names.add(name);
          }
        });
        resolve(Array.from(names));
      });
    } else if (process.platform === "darwin" || process.platform === "linux") {
      exec("ps -A -o comm=", { maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) return resolve([]);
        const names = new Set();
        stdout.split(/\r?\n/).forEach(line => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const base = trimmed.split("/").pop().toLowerCase();
          if (base) names.add(base);
        });
        resolve(Array.from(names));
      });
    } else {
      resolve([]);
    }
  });
}

ipcMain.handle("get-running-processes", async () => {
  try {
    return await listRunningProcesses();
  } catch (e) {
    log.warn("[activity] process list failed:", e?.message || e);
    return [];
  }
});

// Open a file picker so user can manually pick a game .exe
ipcMain.handle("pick-game-exe", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose game executable",
    properties: ["openFile"],
    filters: process.platform === "win32"
      ? [{ name: "Executables", extensions: ["exe"] }]
      : [{ name: "All files", extensions: ["*"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const fullPath = result.filePaths[0];
  const fileName = path.basename(fullPath);
  const processName = fileName.toLowerCase().replace(/\.exe$/, "");
  // Default display name = filename without extension, prettified
  const displayGuess = fileName
    .replace(/\.exe$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { processName, displayName: displayGuess, fullPath };
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
