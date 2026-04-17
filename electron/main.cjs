const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, dialog, Notification, nativeImage, protocol, session } = require("electron");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");

app.name = "Cubbly";

// AppUserModelID — required on Windows so toast notifications attribute to Cubbly
// (and don't show as "electron.app.Cubbly"). Must be set BEFORE any window or notification.
// MUST match the `appId` in package.json -> "build" -> "appId", otherwise
// Windows attributes toasts to "Electron" instead of "Cubbly".
try {
  app.setAppUserModelId("app.cubbly.desktop");
} catch (_) { /* noop on non-windows */ }

// Configure logging for the auto-updater (helps debug update issues)
log.transports.file.level = "info";
autoUpdater.logger = log;
autoUpdater.autoDownload = true;       // Download new versions in the background
autoUpdater.autoInstallOnAppQuit = true; // Fallback: install on quit if user never restarts
// Consider BOTH stable releases AND pre-releases — whichever has the highest
// semver wins. Without this flag electron-updater silently ignores any GitHub
// release marked "pre-release", which is why v0.2.2 was never picked up.
autoUpdater.allowPrerelease = true;
autoUpdater.allowDowngrade = false;

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
let appIconImage = null;

/** Resolve our .ico to an on-disk path that Windows can actually read.
 *  Inside an asar archive, native APIs can't read files, so we mark the
 *  icon as `asarUnpack` and resolve it from app.asar.unpacked. */
function getAppIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar.unpacked", "electron", "icon.ico")
    : path.join(__dirname, "icon.ico");
}
function getAppIconImage() {
  if (appIconImage && !appIconImage.isEmpty()) return appIconImage;
  try {
    const img = nativeImage.createFromPath(getAppIconPath());
    if (!img.isEmpty()) { appIconImage = img; return img; }
  } catch (_) {}
  return null;
}

function createWindow() {
  const iconImage = getAppIconImage();

  // SELF-HEAL: if a misbuilt dist/index.html references "/assets/..." (absolute),
  // those resolve to drive root under file:// and 404. Intercept and redirect to
  // the dist folder so a broken installer recovers without a re-download.
  try {
    const distDir = path.join(__dirname, "..", "dist");
    session.defaultSession.webRequest.onBeforeRequest({ urls: ["file:///*"] }, (details, callback) => {
      try {
        const u = new URL(details.url);
        // On Windows file:// URLs decode to e.g. /C:/assets/...; on macOS/Linux to /assets/...
        const decoded = decodeURIComponent(u.pathname);
        const m = decoded.match(/\/assets\/([^?#]+)$/);
        if (m && !decoded.includes("/dist/assets/")) {
          const fixed = path.join(distDir, "assets", m[1]);
          if (fs.existsSync(fixed)) {
            return callback({ redirectURL: "file:///" + fixed.replace(/\\/g, "/") });
          }
        }
      } catch (_) { /* noop */ }
      callback({});
    });
  } catch (e) {
    log.warn("[selfheal] webRequest hook failed:", e?.message || e);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "Cubbly",
    icon: iconImage || getAppIconPath(),
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
  autoUpdater.on("checking-for-update", () => {
    log.info("[updater] checking-for-update");
    mainWindow?.webContents.send("update-status", { type: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    log.info("[updater] update-available", info?.version);
    mainWindow?.webContents.send("update-available", { version: info?.version });
    mainWindow?.webContents.send("update-status", { type: "available", version: info?.version });
  });
  autoUpdater.on("update-not-available", (info) => {
    log.info("[updater] update-not-available", info?.version);
    mainWindow?.webContents.send("update-status", { type: "not-available", version: info?.version });
  });
  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("update-progress", progress?.percent ?? 0);
    mainWindow?.webContents.send("update-status", {
      type: "downloading",
      percent: progress?.percent ?? 0,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    log.info("[updater] update-downloaded", info?.version);
    mainWindow?.webContents.send("update-downloaded", { version: info?.version });
    mainWindow?.webContents.send("update-status", { type: "downloaded", version: info?.version });
  });
  autoUpdater.on("error", (err) => {
    const message = err?.message || String(err);
    log.error("[updater] error", message);
    mainWindow?.webContents.send("update-status", { type: "error", message });
  });

  setTimeout(() => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) {
      const message = e?.message || String(e);
      log.warn("[updater] initial check failed:", message);
      mainWindow?.webContents.send("update-status", { type: "error", message });
    }
  }, 4000);

  setInterval(() => {
    try { autoUpdater.checkForUpdates(); }
    catch (e) {
      const message = e?.message || String(e);
      log.warn("[updater] periodic check failed:", message);
      mainWindow?.webContents.send("update-status", { type: "error", message });
    }
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
  catch (e) {
    const message = e?.message || String(e);
    log.warn("[updater] manual check failed:", message);
    mainWindow?.webContents.send("update-status", { type: "error", message });
  }
});
ipcMain.on("install-update", () => {
  log.info("[updater] user requested install");
  autoUpdater.quitAndInstall(false, true);
});

// ----- Native desktop notifications -----
// Renderer fires this when a new message arrives and the window isn't focused.
// We use Electron's main-process Notification (not the renderer Web Notification API)
// because it gives proper Windows toast attribution under our AppUserModelID.
// Tiny in-memory cache of remote avatars -> nativeImage so we don't refetch
// for every message in the same DM.
const remoteIconCache = new Map(); // url -> nativeImage
async function loadRemoteIcon(url) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  if (remoteIconCache.has(url)) return remoteIconCache.get(url);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const img = nativeImage.createFromBuffer(buf);
    if (img.isEmpty()) return null;
    remoteIconCache.set(url, img);
    return img;
  } catch (e) {
    log.warn("[notify] avatar fetch failed:", e?.message || e);
    return null;
  }
}

ipcMain.handle("show-notification", async (_evt, opts) => {
  try {
    if (!Notification.isSupported()) return false;
    // Prefer the sender's avatar URL (Discord-style); fall back to app icon.
    let icon = await loadRemoteIcon(opts?.icon);
    if (!icon) {
      icon = getAppIconImage() || undefined;
    }
    const n = new Notification({
      title: opts?.title || "Cubbly",
      body: opts?.body || "",
      icon,
      // Always silent — we play our own message.wav from the renderer so the
      // OS doesn't double-up with its generic ding.
      silent: true,
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

// ----- Process icon extractor (Windows + macOS + Linux best-effort) -----
// Given a process name (e.g. "valorant"), returns a base64 data URL of the
// process .exe / .app icon. Used as a final fallback when we don't have a
// curated logo or a Steam header for the activity.
const iconCache = new Map(); // processName -> dataURL | null
async function getProcessIcon(processName) {
  if (!processName) return null;
  const key = processName.toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);

  try {
    if (process.platform === "win32") {
      // Use PowerShell to find a running process and its full executable path,
      // then ask Electron to extract its file icon.
      const ps = `Get-Process -Name '${key.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Path`;
      const exePath = await new Promise((resolve) => {
        exec(`powershell -NoProfile -Command "${ps}"`, { windowsHide: true, timeout: 4000 }, (err, stdout) => {
          if (err) return resolve(null);
          const path = (stdout || "").trim();
          resolve(path || null);
        });
      });
      if (!exePath) { iconCache.set(key, null); return null; }
      try {
        const img = await app.getFileIcon(exePath, { size: "large" });
        const dataUrl = img.isEmpty() ? null : img.toDataURL();
        iconCache.set(key, dataUrl);
        return dataUrl;
      } catch (_) {
        iconCache.set(key, null);
        return null;
      }
    }

    if (process.platform === "darwin") {
      // Try /Applications/<Name>.app
      const appPath = `/Applications/${processName}.app`;
      try {
        const img = await app.getFileIcon(appPath, { size: "large" });
        const dataUrl = img.isEmpty() ? null : img.toDataURL();
        iconCache.set(key, dataUrl);
        return dataUrl;
      } catch (_) {
        iconCache.set(key, null);
        return null;
      }
    }
  } catch (e) {
    log.warn("[activity] getProcessIcon failed:", e?.message || e);
  }
  iconCache.set(key, null);
  return null;
}
ipcMain.handle("get-process-icon", async (_evt, processName) => getProcessIcon(processName));

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

// ----- Modern display-capture pipeline (Electron 28+) -----
// Renderer picks a source via the picker, then calls
// `electronAPI.setSelectedShareSource(sourceId, wantAudio)` followed by
// `navigator.mediaDevices.getDisplayMedia(...)`. Main intercepts the request
// here and grants the chosen source — with `audio: 'loopback'` when the user
// requested audio. This is the path that actually delivers a usable share
// audio track for window/screen sources, unlike the legacy
// `chromeMediaSourceId` constraint which often returns video-only.
let pendingShareSourceId = null;
let pendingShareWantAudio = false;
ipcMain.handle("set-selected-share-source", (_evt, sourceId, wantAudio) => {
  pendingShareSourceId = sourceId || null;
  pendingShareWantAudio = !!wantAudio;
  log.info("[share] selected source set:", sourceId, "audio:", !!wantAudio);
  return true;
});
ipcMain.handle("clear-selected-share-source", () => {
  pendingShareSourceId = null;
  pendingShareWantAudio = false;
  return true;
});

function installDisplayMediaHandler() {
  try {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        if (!pendingShareSourceId) {
          log.warn("[share] getDisplayMedia called with no pending source — denying");
          callback({});
          return;
        }
        const sources = await desktopCapturer.getSources({
          types: ["window", "screen"],
          thumbnailSize: { width: 0, height: 0 },
        });
        const match = sources.find(s => s.id === pendingShareSourceId);
        if (!match) {
          log.warn("[share] pending source not found among desktopCapturer sources:", pendingShareSourceId);
          callback({});
          return;
        }
        const grant = { video: match };
        if (pendingShareWantAudio) {
          // 'loopback' = system audio capture on Windows; on macOS Electron will
          // fall back to no audio (macOS has no public loopback API). Browsers/
          // Linux behave per Chromium defaults.
          grant.audio = "loopback";
        }
        log.info("[share] granting source:", match.id, "withAudio:", pendingShareWantAudio);
        callback(grant);
      } catch (e) {
        log.error("[share] display-media handler failed:", e?.message || e);
        callback({});
      } finally {
        // One-shot — clear so the next share requires a fresh pick
        pendingShareSourceId = null;
        pendingShareWantAudio = false;
      }
    }, { useSystemPicker: false });
  } catch (e) {
    log.warn("[share] failed to install display-media handler:", e?.message || e);
  }
}

app.whenReady().then(() => {
  installDisplayMediaHandler();
  createWindow();
});
app.on("window-all-closed", () => { app.quit(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
