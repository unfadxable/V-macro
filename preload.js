
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vMacro", {
  getStatus: () => {
    return ipcRenderer.invoke("macro:get-status");
  },

  updateSettings: (settings) => {
    return ipcRenderer.invoke("macro:update-settings", settings);
  },

  start: () => {
    return ipcRenderer.invoke("macro:start");
  },

  stop: () => {
    return ipcRenderer.invoke("macro:stop");
  }
});
