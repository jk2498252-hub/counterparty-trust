const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("backup", { submit: password => ipcRenderer.invoke("backup-password", password) });
