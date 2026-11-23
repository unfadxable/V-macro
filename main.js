
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { MacroController } = require("./macro");

const macro = new MacroController();

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 600,
    minHeight: 450,
    title: "V Macro",
    backgroundColor: "#000000",
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Get the current macro status
ipcMain.handle("macro:get-status", () => {
  return macro.getStatus();
});

// Update macro settings
ipcMain.handle("macro:update-settings", (_event, settings) => {
  try {
    const result = macro.updateSettings(settings);

    return {
      success: true,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Start the macro
ipcMain.handle("macro:start", () => {
  try {
    const running = macro.start();

    return {
      success: true,
      running
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Stop the macro
ipcMain.handle("macro:stop", () => {
  try {
    const running = macro.stop();

    return {
      success: true,
      running
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Start the application
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Stop the macro before quitting
app.on("before-quit", () => {
  macro.stop();
});

// Handle closing all windows
app.on("window-all-closed", () => {
  macro.stop();

  if (process.platform !== "darwin") {
    app.quit();
  }
});
