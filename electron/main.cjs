const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, dialog, Notification, nativeImage } = require("electron");
const path = require("path");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

app.name = "Cubbly";

// AppUserModelID — required on Windows so toast notifications attribute to Cubbly
// (and don't show as "electron.app.Cubbly"). Must be set BEFORE any window or notification.
try {
  app.setAppUserModelId("app.cubbly");
} catch (_) { /* noop on non-windows */ }

// Configure logging for the auto-updater (helps debug update issues)
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;       // Download new versions in the background
autoUpdater.autoInstallOnAppQuit = true; // Fallback: install on quit if user never restarts

// ----- Auto-launch on system startup (Discord-style) -----
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

  // ----- Auto-updater wiring -----
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

  setTimeout(() => {
    try { autoUpdater.checkForUpdatesAndNotify(); }
    catch (e) { log.warn("[updater] initial check failed:", e?.message || e); }
  }, 4000);

  setInterval(() => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) { log.warn("[updater] periodic check failed:", e?.message || e); }
  }, 60 * 60 * 1000);
}

// IPC: window controls
ipcMain.on("window-minimize", () => { mainWindow?.minimize(); });
ipcMain.on("window-maximize", () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on("window-close", () => { mainWindow?.close(); });
ipcMain.handle("window-is-maximized", () => mainWindow?.isMaximized() ?? false);

// IPC: updater
ipcMain.on("check-for-updates", () => {
  try { autoUpdater.checkForUpdates(); }
  catch (e) { log.warn("[updater] manual check failed:", e?.message || e); }
});
ipcMain.on("install-update", () => {
  log.info("[updater] user requested install");
  autoUpdater.quitAndInstall(false, true);
});

// ----- Native desktop notifications -----
// Renderer fires this when a new message arrives and the window isn't focused.
// We use Electron's main-process Notification (not the renderer Web Notification API)
// because it gives proper Windows toast attribution under our AppUserModelID.
ipcMain.handle("show-notification", async (_evt, opts) => {
  try {
    if (!Notification.isSupported()) return false;
    const iconPath = path.join(__dirname, "..", "dist", "favicon.ico");
    let icon;
    try { icon = nativeImage.createFromPath(iconPath); } catch { icon = undefined; }
    const n = new Notification({
      title: opts?.title || "Cubbly",
      body: opts?.body || "",
      icon,
      silent: !!opts?.silent, // we play our own sound from renderer
    });
    n.on("click", () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        if (opts?.tag) {
          mainWindow.webContents.send("notification-clicked", { tag: opts.tag });
        }
      }
    });
    n.show();
    return true;
  } catch (e) {
    log.warn("[notify] failed:", e?.message || e);
    return false;
  }
});

// ----- Process scanner (for activity detection) -----
function listRunningProcesses() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
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
  try { return await listRunningProcesses(); }
  catch (e) { log.warn("[activity] process list failed:", e?.message || e); return []; }
});

// ----- Open-windows scanner (for the "currently running" picker) -----
// Returns [{ title, processName }] of visible top-level windows. We use this to
// give users a friendly list of apps they can add as a custom game without
// having to find the .exe themselves.
function listOpenWindows() {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      // PowerShell one-liner: enumerate processes that have a MainWindowTitle
      const ps = `Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object MainWindowTitle, ProcessName | ConvertTo-Json -Compress`;
      exec(`powershell -NoProfile -Command "${ps}"`, { maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        if (err) return resolve([]);
        try {
          const parsed = JSON.parse(stdout || "[]");
          const arr = Array.isArray(parsed) ? parsed : [parsed];
          const out = arr
            .filter(p => p && p.MainWindowTitle && p.ProcessName)
            .map(p => ({
              title: String(p.MainWindowTitle),
              processName: String(p.ProcessName).toLowerCase().replace(/\.exe$/, ""),
            }));
          resolve(out);
        } catch { resolve([]); }
      });
    } else if (process.platform === "darwin") {
      // AppleScript: visible apps and their frontmost window title (best-effort)
      const osa = `osascript -e 'tell application "System Events" to get {name, title of front window} of (every process whose visible is true and background only is false)' 2>/dev/null`;
      exec(osa, { maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        // Output is hard to parse reliably; fall back to just app names.
        exec(`osascript -e 'tell application "System Events" to get name of (every process whose visible is true and background only is false)'`, (err2, stdout2) => {
          if (err2 || !stdout2) return resolve([]);
          const names = stdout2.split(",").map(s => s.trim()).filter(Boolean);
          resolve(names.map(n => ({ title: n, processName: n.toLowerCase().replace(/\.app$/, "") })));
        });
      });
    } else {
      // Linux: try wmctrl, then xdotool, then nothing
      exec("wmctrl -lp 2>/dev/null", (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split(/\r?\n/).filter(Boolean);
          const out = lines.map(l => {
            // wmctrl format: "0xID  desk  pid  host  title..."
            const parts = l.split(/\s+/);
            const title = parts.slice(4).join(" ");
            return title ? { title, processName: title.toLowerCase().split(/\s+/)[0] } : null;
          }).filter(Boolean);
          return resolve(out);
        }
        resolve([]);
      });
    }
  });
}
ipcMain.handle("get-open-windows", async () => {
  try { return await listOpenWindows(); }
  catch (e) { log.warn("[activity] open windows failed:", e?.message || e); return []; }
});

// IPC: pick game .exe (manual)
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
app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
