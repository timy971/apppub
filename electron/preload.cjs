/* eslint-disable */
/**
 * AppPublisher — Preload script.
 * Expose une API réduite et fortement typée sur window.appPublisher.
 * Aucune API Node n'est jamais exposée directement au renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("appPublisher", {
  runtime: "electron",

  system: {
    detect: () => ipcRenderer.invoke("system:detect"),
  },

  projects: {
    detect: (p) => ipcRenderer.invoke("projects:detect", p),
    scan: (root) => ipcRenderer.invoke("projects:scan", root),
    chooseFolder: () => ipcRenderer.invoke("projects:chooseFolder"),
  },

  exec: {
    run: (opts, channel) => ipcRenderer.invoke("exec:run", opts, channel),
    subscribeLines: (channel, cb) => {
      const listener = (_e, line) => cb(line);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },

  fs: {
    exists: (p) => ipcRenderer.invoke("fs:exists", p),
    readJson: (p) => ipcRenderer.invoke("fs:readJson", p),
    readText: (p) => ipcRenderer.invoke("fs:readText", p),
    stat: (p) => ipcRenderer.invoke("fs:stat", p),
    listDir: (p) => ipcRenderer.invoke("fs:listDir", p),
    findByExtension: (d, e, max) => ipcRenderer.invoke("fs:findByExtension", d, e, max),
  },

  shell: {
    openFolder: (p) => ipcRenderer.invoke("shell:openFolder", p),
    revealItem: (p) => ipcRenderer.invoke("shell:revealItem", p),
  },

  net: {
    online: () => ipcRenderer.invoke("net:online"),
  },
});
