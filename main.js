
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { MacroController } = require("./macro");

const macro = new MacroController();

function createWindow() {
  const window = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 450,
    title: "V Macro",
    backgroundColor: "#101319",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("macro:get-status", () => {
  return macro.getStatus();
});

ipcMain.handle("macro:update-settings", (_, settings) => {
  return macro.updateSettings(settings);
});

ipcMain.handle("macro:start", () => {
  try {
    return { success: true, running: macro.start() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("macro:stop", () => {
  return { success: true, running: macro.stop() };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  macro.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
