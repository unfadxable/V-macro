const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("vMacro", {
  getAppName: () => "V Macro",
  getVersion: () => "1.0.0"
});
