/**
 * AppPublisher — Preload script (instrumenté Phase 3.7 Diagnostic).
 *
 * Chaque ipcRenderer.invoke() est routé par `inv()` qui :
 *  - attribue un identifiant d'opération unique,
 *  - envoie un log "invoke <channel>" au Main (fichier + console),
 *  - envoie "resolve" ou "reject" avec la durée exacte,
 *  - tient à jour une table des invokes en attente pour le watchdog.
 *
 * Un watchdog s'exécute toutes les 2 s : toute invocation non résolue
 * depuis plus de 2 s émet un log "watchdog" avec son âge.
 *
 * Aucune API Node n'est exposée directement au renderer.
 */
const { contextBridge, ipcRenderer } = require("electron");

let opSeq = 0;
const pending = new Map();

function sendDiag(entry) {
  try {
    ipcRenderer.send("diag:log", {
      ts: new Date().toISOString(),
      source: "preload",
      ...entry,
    });
  } catch {}
}

function inv(channel, ...args) {
  const opId = `p${++opSeq}`;
  const started = Date.now();
  pending.set(opId, { channel, started });
  sendDiag({ level: "invoke", message: `invoke ${channel}`, opId });
  return ipcRenderer.invoke(channel, ...args).then(
    (res) => {
      pending.delete(opId);
      sendDiag({
        level: "resolve",
        message: `resolve ${channel}`,
        opId,
        durationMs: Date.now() - started,
      });
      return res;
    },
    (err) => {
      pending.delete(opId);
      sendDiag({
        level: "reject",
        message: `reject ${channel}`,
        opId,
        durationMs: Date.now() - started,
        error: String(err?.message ?? err),
      });
      throw err;
    },
  );
}

/* Watchdog preload : signale toute invocation IPC bloquée > 2 s. */
setInterval(() => {
  const now = Date.now();
  for (const [opId, { channel, started }] of pending) {
    const age = now - started;
    if (age > 2000) {
      sendDiag({
        level: "watchdog",
        message: `preload invoke '${channel}' bloqué depuis ${Math.round(age / 1000)}s`,
        opId,
      });
    }
  }
}, 2000);

contextBridge.exposeInMainWorld("appPublisher", {
  runtime: "electron",

  diag: {
    log: (entry) => {
      try {
        ipcRenderer.send("diag:log", {
          ts: new Date().toISOString(),
          source: "renderer",
          ...(entry || {}),
        });
      } catch {}
    },
    openLog: () => inv("diag:openLog"),
    revealLog: () => inv("diag:revealLog"),
    getLogPath: () => inv("diag:getLogPath"),
    getLogDir: () => inv("diag:getLogDir"),
    tail: (limit) => inv("diag:tail", limit),
    getSysInfo: () => inv("diag:getSysInfo"),
    exportBundle: (extra) => inv("diag:exportBundle", extra),
    onNavigate: (cb) => {
      const listener = (_e, target) => {
        try {
          cb(target);
        } catch {}
      };
      ipcRenderer.on("diag:navigate", listener);
      return () => ipcRenderer.removeListener("diag:navigate", listener);
    },
  },

  system: {
    detect: () => inv("system:detect"),
  },

  storage: {
    get: (key) => ipcRenderer.sendSync("storage:get", key),
    set: (key, value) => ipcRenderer.sendSync("storage:set", key, value),
    remove: (key) => ipcRenderer.sendSync("storage:remove", key),
    status: () => ipcRenderer.sendSync("storage:status"),
    exportFile: () => inv("storage:export"),
    importFile: () => inv("storage:import"),
  },

  projects: {
    detect: (p) => inv("projects:detect", p),
    scan: (root) => inv("projects:scan", root),
    chooseFolder: () => inv("projects:chooseFolder"),
    reauthorizeFolder: (expectedPath) => inv("projects:reauthorizeFolder", expectedPath),
  },

  git: {
    inspectRemote: (remoteUrl) => inv("git:inspectRemote", remoteUrl),
    clone: (args) => inv("git:clone", args),
    status: (args) => inv("git:status", args),
    check: (args) => inv("git:check", args),
    sync: (args) => inv("git:sync", args),
  },

  androidPreparation: {
    inspect: (projectPath) => inv("android-preparation:inspect", projectPath),
    createConfig: (projectPath, request) =>
      inv("android-preparation:createConfig", projectPath, request),
  },

  androidCorrections: {
    preview: (projectPath, desired) => inv("android-corrections:preview", projectPath, desired),
    apply: (projectPath, desired, token) =>
      inv("android-corrections:apply", projectPath, desired, token),
  },

  aab: {
    inspect: (request) => inv("aab:inspect", request),
  },

  gradle: {
    ensureExecutable: (projectPath) => inv("gradle:ensureExecutable", projectPath),
    ensureSigningPatch: (androidDir) => inv("gradle:ensureSigningPatch", androidDir),
  },

  backups: {
    create: (projectPath, reason) => inv("backups:create", projectPath, reason),
    restore: (projectPath, location, files) => inv("backups:restore", projectPath, location, files),
  },

  exec: {
    run: (opts, channel, executionId) => inv("exec:run", opts, channel, executionId),
    cancel: (executionId) => inv("exec:cancel", executionId),
    subscribeLines: (channel, cb) => {
      const listener = (_e, line) => cb(line);
      ipcRenderer.on(channel, listener);
      sendDiag({ level: "subscribe", message: `subscribe ${channel}` });
      return () => {
        ipcRenderer.removeListener(channel, listener);
        sendDiag({ level: "unsubscribe", message: `unsubscribe ${channel}` });
      };
    },
  },

  fs: {
    exists: (p) => inv("fs:exists", p),
    readJson: (p) => inv("fs:readJson", p),
    readText: (p) => inv("fs:readText", p),
    stat: (p) => inv("fs:stat", p),
    listDir: (p) => inv("fs:listDir", p),
    findByExtension: (d, e, max) => inv("fs:findByExtension", d, e, max),
  },

  shell: {
    openFolder: (p) => inv("shell:openFolder", p),
    revealItem: (p) => inv("shell:revealItem", p),
    openExternal: (url) => inv("shell:openExternal", url),
  },

  net: {
    online: () => inv("net:online"),
  },

  secrets: {
    supported: () => inv("secrets:supported"),
    set: (profileId, field, value) => inv("secrets:set", profileId, field, value),
    remove: (profileId) => inv("secrets:remove", profileId),
  },

  signing: {
    chooseKeystore: () => inv("signing:chooseKeystore"),
    chooseOutputFolder: () => inv("signing:chooseOutputFolder"),
    keystoreList: (args) => inv("signing:keystoreList", args),
    keystoreCreate: (args) => inv("signing:keystoreCreate", args),
    validateStored: (args) => inv("signing:validateStored", args),
    prepareBuild: (args) => inv("signing:prepareBuild", args),
    scan: (roots) => inv("signing:scan", roots),
    resolveKeystore: (args) => inv("signing:resolveKeystore", args),
    verifyAab: (path) => inv("signing:verifyAab", path),
  },
});

sendDiag({ level: "info", message: "preload loaded" });
