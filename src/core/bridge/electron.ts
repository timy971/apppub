import type { SystemBridge } from "./types";

/**
 * Adapter Electron — délègue à `window.appPublisher` exposé par preload.cjs.
 */

interface AppPublisherApi {
  runtime: "electron";
  system: SystemBridge["system"];
  storage: {
    get(key: string): { ok: boolean; found?: boolean; value?: unknown; error?: string };
    set(key: string, value: unknown): { ok: boolean; error?: string };
    remove(key: string): { ok: boolean; error?: string };
    status(): {
      ok: boolean;
      schemaVersion?: number;
      filePath?: string;
      lastError?: string | null;
      error?: string;
    };
    exportFile(): Promise<string | null>;
    importFile(): Promise<{ path: string; keys: string[] } | null>;
  };
  projects: SystemBridge["projects"];
  git: SystemBridge["git"];
  androidPreparation: SystemBridge["androidPreparation"];
  gradle: SystemBridge["gradle"];
  backups: SystemBridge["backups"];
  exec: {
    run: (
      opts: Parameters<SystemBridge["exec"]["run"]>[0],
      onLineChannel?: string,
      executionId?: string,
    ) => Promise<Awaited<ReturnType<SystemBridge["exec"]["run"]>>>;
    cancel: (executionId: string) => Promise<boolean>;
    subscribeLines: (
      channel: string,
      cb: (line: { stream: "stdout" | "stderr"; line: string }) => void,
    ) => () => void;
  };
  fs: SystemBridge["fs"];
  shell: SystemBridge["shell"];
  net: SystemBridge["net"];
  secrets: SystemBridge["secrets"];
  signing: SystemBridge["signing"];
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
    reauthorizeFolder: (expectedPath) => ensure().projects.reauthorizeFolder(expectedPath),
  },

  git: {
    inspectRemote: (remoteUrl) => ensure().git.inspectRemote(remoteUrl),
    clone: (args) => ensure().git.clone(args),
    status: (args) => ensure().git.status(args),
    check: (args) => ensure().git.check(args),
    sync: (args) => ensure().git.sync(args),
  },

  androidPreparation: {
    inspect: (projectPath) => ensure().androidPreparation.inspect(projectPath),
    createConfig: (projectPath, request) =>
      ensure().androidPreparation.createConfig(projectPath, request),
  },

  gradle: {
    ensureExecutable: (projectPath) => ensure().gradle.ensureExecutable(projectPath),
    ensureSigningPatch: (androidDir) => ensure().gradle.ensureSigningPatch(androidDir),
  },

  backups: {
    create: (projectPath, reason) => ensure().backups.create(projectPath, reason),
    restore: (projectPath, location, files) =>
      ensure().backups.restore(projectPath, location, files),
  },

  exec: {
    async run(opts, onLine, signal) {
      const api = ensure();
      const channel = `exec-${Math.random().toString(36).slice(2)}`;
      const executionId = createExecutionId();
      const unsubscribe = onLine ? api.exec.subscribeLines(channel, onLine) : () => {};
      const cancel = () => {
        void api.exec.cancel(executionId);
      };
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        const result = await api.exec.run(opts, onLine ? channel : undefined, executionId);
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        return result;
      } finally {
        signal?.removeEventListener("abort", cancel);
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
    openExternal: (url) => ensure().shell.openExternal(url),
  },

  net: {
    online: () => ensure().net.online(),
  },

  secrets: {
    supported: () => ensure().secrets.supported(),
    set: (id, field, value) => ensure().secrets.set(id, field, value),
    remove: (id) => ensure().secrets.remove(id),
  },

  signing: {
    chooseKeystore: () => ensure().signing.chooseKeystore(),
    chooseOutputFolder: () => ensure().signing.chooseOutputFolder(),
    keystoreList: (args) => ensure().signing.keystoreList(args),
    keystoreCreate: (args) => ensure().signing.keystoreCreate(args),
    validateStored: (args) => ensure().signing.validateStored(args),
    prepareBuild: (args) => ensure().signing.prepareBuild(args),
    scan: (roots) => ensure().signing.scan(roots),
    resolveKeystore: (args) => ensure().signing.resolveKeystore(args),
    verifyAab: (path) => ensure().signing.verifyAab(path),
  },
};

function createExecutionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `exec_${crypto.randomUUID().replace(/-/g, "")}`;
  }
  return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}
