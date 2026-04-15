const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "Cubbly",
    icon: path.join(__dirname, "..", "public", "favicon.ico"),
    frame: false,
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1e1610",
      symbolColor: "#f5e6d3",
      height: 32,
    },
    backgroundColor: "#1e1610",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the built app
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
