const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

// Set app name
app.name = "Cubbly";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    title: "Cubbly",
    icon: path.join(__dirname, "..", "dist", "favicon.ico"),
    autoHideMenuBar: true,
    backgroundColor: "#1e1610",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Remove the default menu bar entirely
  Menu.setApplicationMenu(null);

  // Load the built app
  mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  // Open external links in the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
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
