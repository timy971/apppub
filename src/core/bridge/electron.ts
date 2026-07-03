import type { SystemBridge } from "./types";

/**
 * Adapter Electron — délègue à `window.appPublisher` exposé par preload.cjs
 * via `contextBridge.exposeInMainWorld`. N'est utilisé que lorsque
 * `hasElectronBridge()` retourne true.
 */

interface AppPublisherApi {
  runtime: "electron";
  system: SystemBridge["system"];
  projects: SystemBridge["projects"];
  exec: {
    run: (
      opts: Parameters<SystemBridge["exec"]["run"]>[0],
      // Le preload passe par un canal IPC : le handler ligne-à-ligne est fourni
      // via un identifiant de subscription. On adapte plus bas.
      onLineChannel?: string,
    ) => Promise<Awaited<ReturnType<SystemBridge["exec"]["run"]>>>;
    subscribeLines: (
      channel: string,
      cb: (line: { stream: "stdout" | "stderr"; line: string }) => void,
    ) => () => void;
  };
  fs: SystemBridge["fs"];
  shell: SystemBridge["shell"];
  net: SystemBridge["net"];
}

declare global {
  interface Window {
    appPublisher?: AppPublisherApi;
  }
}

export function hasElectronBridge(): boolean {
  return typeof window !== "undefined" && !!window.appPublisher;
}

function ensure(): AppPublisherApi {
  const api = typeof window !== "undefined" ? window.appPublisher : undefined;
  if (!api) throw new Error("Bridge Electron non disponible");
  return api;
}

export const electronBridge: SystemBridge = {
  runtime: "electron",

  system: {
    detect: () => ensure().system.detect(),
  },

  projects: {
    detect: (path) => ensure().projects.detect(path),
    scan: (root) => ensure().projects.scan(root),
    chooseFolder: () => ensure().projects.chooseFolder(),
  },

  exec: {
    async run(opts, onLine) {
      const api = ensure();
      const channel = `exec-${Math.random().toString(36).slice(2)}`;
      const unsubscribe = onLine ? api.exec.subscribeLines(channel, onLine) : () => {};
      try {
        return await api.exec.run(opts, onLine ? channel : undefined);
      } finally {
        unsubscribe();
      }
    },
  },

  fs: {
    exists: (p) => ensure().fs.exists(p),
    readJson: (p) => ensure().fs.readJson(p),
    readText: (p) => ensure().fs.readText(p),
    stat: (p) => ensure().fs.stat(p),
    listDir: (p) => ensure().fs.listDir(p),
    findByExtension: (d, e, max) => ensure().fs.findByExtension(d, e, max),
  },

  shell: {
    openFolder: (p) => ensure().shell.openFolder(p),
    revealItem: (p) => ensure().shell.revealItem(p),
  },

  net: {
    online: () => ensure().net.online(),
  },
};
