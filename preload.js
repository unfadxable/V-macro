
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vMacro", {
  getStatus: () => ipcRenderer.invoke("macro:get-status"),

  updateSettings: (settings) =>
    ipcRenderer.invoke("macro:update-settings", settings),

  start: () => ipcRenderer.invoke("macro:start"),

  stop: () => ipcRenderer.invoke("macro:stop")
});
