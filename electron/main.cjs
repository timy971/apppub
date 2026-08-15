/**
 * AppPublisher — Electron main process (Phase 3).
 *
 * Sécurité
 *  - `exec:run` : workflows exacts, confirmation native, `shell:false` et
 *    session opaque pour injecter les secrets Gradle depuis le main process.
 *  - Les chemins sont canonicalisés et confinés aux projets choisis via un
 *    dialogue natif ; le renderer n'expose aucune primitive générique d'écriture.
 *
 * Nouveautés Phase 3
 *  - `bootstrapPath()` : au démarrage, on importe le PATH d'un login shell
 *    utilisateur (zsh/bash) pour retrouver Homebrew, nvm, JDK, sdkmanager,
 *    exactement comme si l'utilisateur ouvrait un Terminal. Sans ça, une
 *    application lancée depuis le Finder ne trouve ni `node`, ni `npm`,
 *    ni `java`, ni `git`.
 *  - Les racines projet ne peuvent être approuvées que par un dialogue natif.
 *  - Les écritures génériques sont absentes du preload : sauvegardes et patch
 *    Gradle passent par des opérations métier dédiées dans le main process.
 */
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  clipboard,
  session,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const https = require("https");
const crypto = require("crypto");
const {
  RedactedOutputCollector,
  redactSensitiveText,
  sanitizeDiagnosticValue,
  summarizeIpcArgs,
} = require("./diagnostic-redaction.cjs");
const { ensureGradleWrapperExecutable } = require("./gradle-executable.cjs");
const {
  ExecutionRegistry,
  isValidExecutionId,
  normalizeSpawnCommand,
  terminateProcessTree,
} = require("./process-manager.cjs");
const { sanitizeExternalUrl } = require("./external-url.cjs");
const { FileAccessRegistry, ProjectAccessRegistry } = require("./path-security.cjs");
const { DurableStore, validateDocument } = require("./durable-store.cjs");
const { BackupManager } = require("./backup-manager.cjs");
const { validateExecutionRequest, findProjectRoot } = require("./execution-policy.cjs");
const { ProjectTrustStore, ensureProjectTrusted } = require("./project-trust.cjs");
const { installWindowGuards } = require("./window-security.cjs");
const { SigningSessionRegistry } = require("./signing-session.cjs");
const { buildPatchedGradle } = require("./gradle-signing-patch.cjs");
const { GitProjectManager } = require("./git-projects.cjs");
const {
  AndroidPreparationManager,
  inspectAndroidPreparation,
} = require("./android-preparation.cjs");
const { AndroidCorrectionManager, publicPlan } = require("./android-corrections.cjs");
const {
  buildValidationReport,
  inspectAabArchive,
  normalizeFingerprint,
} = require("./aab-inspector.cjs");
const {
  GooglePlayError,
  GooglePlayPublisher,
  validateGooglePlayCredentials,
  validateServiceAccountCredentials,
} = require("./google-play-publisher.cjs");
const { GooglePlayOAuth, loadGooglePlayOAuthConfig } = require("./google-play-oauth.cjs");

const isDev = !!process.env.APPPUBLISHER_DEV_URL;
const activeExecutions = new ExecutionRegistry();
const signingSessions = new SigningSessionRegistry();
const trustedWebContentsIds = new Set();
const knownSecretValues = new Set();
let mainWindow = null;

/* ---------- Bootstrap : PATH utilisateur (macOS/Linux) ----------
 *
 * Objectifs (audit I1) :
 *  - Ne PAS bloquer le démarrage plus de ~1.5 s : on utilise un shell
 *    non-interactif (-lc) qui saute les plugins zsh/oh-my-zsh coûteux
 *    tout en chargeant .zprofile/.bash_profile (nvm, brew, jenv…).
 *  - Toujours fournir un PATH utilisable : même si le shell échoue ou
 *    dépasse le timeout, on ajoute une liste de chemins standards
 *    (Homebrew Apple Silicon, Homebrew Intel, /usr/local/bin, nvm par
 *    défaut) pour que `node`/`npm`/`git` soient trouvés au premier lancement.
 */

function defaultFallbackPaths() {
  const home = process.env.HOME || "";
  const list = [
    "/opt/homebrew/bin", // macOS Apple Silicon (brew)
    "/opt/homebrew/sbin",
    "/usr/local/bin", // macOS Intel (brew)
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  if (home) {
    list.push(
      `${home}/.nvm/versions/node/current/bin`,
      `${home}/.volta/bin`,
      `${home}/.local/bin`,
      `${home}/.cargo/bin`,
    );
  }
  return list;
}

function mergePath(extra) {
  const current = (process.env.PATH || "").split(":").filter(Boolean);
  const seen = new Set(current);
  const merged = [...current];
  for (const p of extra) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    merged.push(p);
  }
  process.env.PATH = merged.join(":");
}

function bootstrapPath() {
  if (process.platform === "win32") return;

  // 1. Fallback statique appliqué immédiatement : garantit un PATH minimal
  //    même si le spawn échoue ou dépasse le timeout.
  mergePath(defaultFallbackPaths());

  // 2. Tentative rapide de récupération du PATH du shell utilisateur
  //    (login shell non-interactif). Timeout serré : on préfère un
  //    démarrage instantané avec un PATH imparfait à un splash gelé.
  try {
    const userShell = process.env.SHELL || "/bin/zsh";
    const r = spawnSync(userShell, ["-lc", "echo __APPPUB_PATH__$PATH"], {
      encoding: "utf8",
      timeout: 1500,
    });
    if (r.status !== 0 || !r.stdout) return;
    const m = r.stdout.match(/__APPPUB_PATH__(.+)/);
    if (m && m[1]) {
      // Le PATH du shell prend la priorité (mis en tête), tout en
      // conservant le fallback derrière au cas où un binaire n'y
      // figurerait pas.
      const shellPaths = m[1].trim().split(":").filter(Boolean);
      const current = (process.env.PATH || "").split(":").filter(Boolean);
      const seen = new Set();
      const merged = [];
      for (const p of [...shellPaths, ...current]) {
        if (!p || seen.has(p)) continue;
        seen.add(p);
        merged.push(p);
      }
      process.env.PATH = merged.join(":");
    }
  } catch {
    // Silencieux : le fallback statique est déjà en place.
  }
}
bootstrapPath();

/* ---------- Diagnostic : journal fichier + watchdog + wrap IPC ---------- */
/**
 * Phase 3.7 — instrumentation.
 * Aucune logique métier n'est modifiée ; seulement de l'observation.
 *
 *  - Journal fichier : <userData>/diagnostic.log (append-only).
 *  - `diagWrite(entry)` : format horodaté, source, niveau, op, durée, ctx.
 *  - Wrap de `ipcMain.handle` : chaque handler produit op:start/op:end
 *    ou op:fail, avec durée exacte. Aucun handler existant à modifier.
 *  - Réception des logs renderer/preload via `ipcMain.on("diag:log")`.
 *  - Watchdog toutes les 2 s : signale toute opération main >2 s.
 */

const DIAG_LOG_DIR = path.join(app.getPath("userData"), "logs");
try {
  fs.mkdirSync(DIAG_LOG_DIR, { recursive: true });
} catch {}

/** Retourne le chemin du fichier de log du jour (`logs/YYYY-MM-DD.log`). */
function currentLogFile() {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return path.join(DIAG_LOG_DIR, `${day}.log`);
}

/** Purge les logs plus vieux que 30 jours. */
function pruneOldLogs() {
  try {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    for (const f of fs.readdirSync(DIAG_LOG_DIR)) {
      const full = path.join(DIAG_LOG_DIR, f);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs < cutoff) fs.unlinkSync(full);
      } catch {}
    }
  } catch {}
}
pruneOldLogs();

const DIAG_LOG_PATH = currentLogFile();
try {
  fs.appendFileSync(
    DIAG_LOG_PATH,
    `\n=== AppPublisher diagnostic session ${new Date().toISOString()} ` +
      `(pid ${process.pid}, ${process.platform}, node ${process.versions.node}, ` +
      `electron ${process.versions.electron}) ===\n`,
    "utf8",
  );
} catch {}

function _safeJSON(v) {
  try {
    return JSON.stringify(sanitizeDiagnosticValue(v, "", new WeakSet(), 0, [...knownSecretValues]));
  } catch {
    return redactSensitiveText(String(v), [...knownSecretValues]);
  }
}

function diagWrite(entry) {
  try {
    const ts = entry.ts || new Date().toISOString();
    const src = entry.source || "main";
    const lvl = entry.level || "info";
    const op = entry.opId ? ` op=${entry.opId}` : "";
    const dur = typeof entry.durationMs === "number" ? ` dur=${entry.durationMs}ms` : "";
    const err = entry.error ? ` err=${_safeJSON(entry.error)}` : "";
    const extra =
      entry.ctx !== undefined
        ? " ctx=" + _safeJSON(entry.ctx)
        : entry.args !== undefined
          ? " args=" + _safeJSON(entry.args)
          : "";
    const line = `[${ts}] [${src}] [${lvl}]${op}${dur} ${entry.message || ""}${extra}${err}\n`;
    fs.appendFileSync(currentLogFile(), line, "utf8");
    // Console main : utile en electron:dev.
    if (isDev) process.stdout.write(line);
  } catch {}
}

const _pendingMainOps = new Map();
let _mainOpSeq = 0;

function diagStart(name, ctx) {
  const opId = `m${++_mainOpSeq}`;
  _pendingMainOps.set(opId, { name, started: Date.now() });
  diagWrite({ level: "op:start", message: name, opId, ctx });
  return opId;
}

function diagEnd(opId, name, ctx) {
  const op = _pendingMainOps.get(opId);
  const durationMs = op ? Date.now() - op.started : undefined;
  _pendingMainOps.delete(opId);
  diagWrite({ level: "op:end", message: name, opId, durationMs, ctx });
}

function diagFail(opId, name, error) {
  const op = _pendingMainOps.get(opId);
  const durationMs = op ? Date.now() - op.started : undefined;
  _pendingMainOps.delete(opId);
  diagWrite({ level: "op:fail", message: name, opId, durationMs, error });
}

const _watchdog = setInterval(() => {
  const now = Date.now();
  for (const [opId, { name, started }] of _pendingMainOps) {
    const age = now - started;
    if (age > 2000) {
      diagWrite({
        level: "watchdog",
        message: `main op '${name}' bloquée depuis ${Math.round(age / 1000)}s`,
        opId,
      });
    }
  }
}, 2000);
if (_watchdog.unref) _watchdog.unref();

/* Wrap ipcMain.handle : chaque handler existant est automatiquement tracé. */
const _origHandle = ipcMain.handle.bind(ipcMain);
function isTrustedIpcSender(event) {
  return Boolean(event?.sender && trustedWebContentsIds.has(event.sender.id));
}

ipcMain.handle = (channel, fn) => {
  _origHandle(channel, async (event, ...args) => {
    if (!isTrustedIpcSender(event)) {
      throw new Error("Émetteur IPC non autorisé.");
    }
    const opId = diagStart(`ipc:${channel}`, {
      args: summarizeIpcArgs(channel, args),
    });
    try {
      const res = await fn(event, ...args);
      diagEnd(opId, `ipc:${channel}`, { returned: typeof res });
      return res;
    } catch (e) {
      diagFail(opId, `ipc:${channel}`, e?.message ?? String(e));
      throw e;
    }
  });
};

/* Réception des logs renderer/preload — non wrapé (send/on, pas invoke). */
ipcMain.on("diag:log", (event, entry) => {
  if (!isTrustedIpcSender(event)) return;
  if (entry && typeof entry === "object") {
    diagWrite({ ...entry, source: entry.source || "renderer" });
  }
});

/* IPC exposés au menu Diagnostic et aux composants de support. */
ipcMain.handle("diag:getLogPath", () => currentLogFile());
ipcMain.handle("diag:getLogDir", () => DIAG_LOG_DIR);
ipcMain.handle("diag:openLog", async () => {
  const p = currentLogFile();
  try {
    await shell.openPath(p);
  } catch (e) {
    diagWrite({ level: "error", message: "diag:openLog failed", error: String(e) });
  }
  return p;
});
ipcMain.handle("diag:revealLog", () => {
  const p = currentLogFile();
  try {
    shell.showItemInFolder(p);
  } catch (e) {
    diagWrite({ level: "error", message: "diag:revealLog failed", error: String(e) });
  }
  return p;
});

/** Renvoie les N dernières lignes du fichier de log courant. */
ipcMain.handle("diag:tail", (_e, limit) => {
  const n = Math.max(1, Math.min(5000, Number(limit) || 500));
  try {
    const p = currentLogFile();
    if (!fs.existsSync(p)) return [];
    const raw = fs.readFileSync(p, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-n);
  } catch {
    return [];
  }
});

/** Informations système pour le bundle de support. */
ipcMain.handle("diag:getSysInfo", () => ({
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  osType: os.type(),
  totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
  freeMemMB: Math.round(os.freemem() / 1024 / 1024),
  cpuModel: (os.cpus()[0] || {}).model,
  cpuCount: os.cpus().length,
  nodeVersion: process.versions.node,
  electronVersion: process.versions.electron,
  chromeVersion: process.versions.chrome,
  appVersion: app.getVersion(),
  locale: app.getLocale(),
  userDataPath: app.getPath("userData"),
  logDir: DIAG_LOG_DIR,
}));

/**
 * Exporte un bundle de support (fichier .txt agrégeant sysinfo + logs récents).
 * Placé sur le bureau utilisateur pour retrouver facilement le fichier.
 */
ipcMain.handle("diag:exportBundle", async (_e, extra) => {
  try {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    const dest = path.join(app.getPath("desktop"), `apppublisher-support-${stamp}.txt`);
    const parts = [];
    parts.push(`# AppPublisher — Bundle de support`);
    parts.push(`Date: ${now.toISOString()}`);
    parts.push(`Version: ${app.getVersion()}`);
    parts.push(`Plateforme: ${process.platform} ${os.release()} (${process.arch})`);
    parts.push(`Node: ${process.versions.node} · Electron: ${process.versions.electron}`);
    parts.push(
      `Mémoire libre/total (Mo): ${Math.round(os.freemem() / 1048576)}/${Math.round(os.totalmem() / 1048576)}`,
    );
    parts.push(`Répertoire de logs: ${DIAG_LOG_DIR}`);
    if (extra && typeof extra === "object") {
      parts.push("");
      parts.push("## Contexte renderer");
      try {
        parts.push(
          JSON.stringify(
            sanitizeDiagnosticValue(extra, "", new WeakSet(), 0, [...knownSecretValues]),
            null,
            2,
          ),
        );
      } catch {}
    }
    parts.push("");
    parts.push("## Fichiers de logs disponibles");
    let files = [];
    try {
      files = fs
        .readdirSync(DIAG_LOG_DIR)
        .filter((f) => f.endsWith(".log"))
        .sort()
        .slice(-3);
    } catch {}
    for (const f of files) {
      parts.push("");
      parts.push(`### ${f}`);
      try {
        parts.push(
          redactSensitiveText(fs.readFileSync(path.join(DIAG_LOG_DIR, f), "utf8"), [
            ...knownSecretValues,
          ]),
        );
      } catch (e) {
        parts.push(`(lecture impossible: ${String(e)})`);
      }
    }
    fs.writeFileSync(dest, parts.join("\n"), "utf8");
    diagWrite({ level: "info", message: "diag:exportBundle ok", ctx: { dest } });
    try {
      shell.showItemInFolder(dest);
    } catch {}
    return dest;
  } catch (e) {
    diagWrite({ level: "error", message: "diag:exportBundle failed", error: String(e) });
    throw e;
  }
});

diagWrite({ level: "info", message: "diag ready", ctx: { path: currentLogFile() } });

/* ---------- Sécurité : racines projet approuvées ---------- */

function knownRootsPath() {
  return path.join(app.getPath("userData"), "known-roots.json");
}

const projectAccess = new ProjectAccessRegistry({ filePath: knownRootsPath() });
const keystoreAccess = new FileAccessRegistry({
  filePath: path.join(app.getPath("userData"), "known-keystores.json"),
});
const keystoreOutputAccess = new ProjectAccessRegistry({
  filePath: path.join(app.getPath("userData"), "known-keystore-output-folders.json"),
});
const backupManager = new BackupManager(projectAccess);
const trustStore = new ProjectTrustStore(
  path.join(app.getPath("userData"), "trusted-projects.json"),
);
const durableStore = new DurableStore(path.join(app.getPath("userData"), "data", "store-v1.json"));
const gitProjectManager = new GitProjectManager(
  path.join(app.getPath("userData"), "managed-projects"),
);
const androidPreparationManager = new AndroidPreparationManager(projectAccess);
const androidCorrectionManager = new AndroidCorrectionManager(projectAccess);
const googlePlayPublisher = new GooglePlayPublisher();
const googlePlayOAuth = new GooglePlayOAuth(
  loadGooglePlayOAuthConfig({
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath(),
  }),
);

function registerAllowedRoot(p) {
  try {
    return projectAccess.approveExisting(p);
  } catch (error) {
    diagWrite({
      level: "warn",
      message: "project root approval failed",
      ctx: { error: String(error) },
    });
    return null;
  }
}

function resolveWithinAllowed(inputPath) {
  return projectAccess.resolveExisting(inputPath);
}

async function confirmProjectTrust({ projectPath, projectName }) {
  const result = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Autoriser l'exécution du projet ?",
    message: `AppPublisher va exécuter le code de « ${projectName} ».`,
    detail:
      `Dossier : ${projectPath}\n\n` +
      "Un build npm, Capacitor ou Gradle peut exécuter des scripts du projet. " +
      "Continuez uniquement si vous connaissez et faites confiance à son origine.",
    buttons: ["Autoriser et continuer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
}

/* ---------- Persistance métier synchrone et atomique ---------- */

ipcMain.on("storage:get", (event, key) => {
  if (!isTrustedIpcSender(event)) {
    event.returnValue = { ok: false, error: "Émetteur IPC non autorisé." };
    return;
  }
  event.returnValue = durableStore.get(key);
});

ipcMain.on("storage:set", (event, key, value) => {
  if (!isTrustedIpcSender(event)) {
    event.returnValue = { ok: false, error: "Émetteur IPC non autorisé." };
    return;
  }
  event.returnValue = durableStore.set(key, value);
});

ipcMain.on("storage:remove", (event, key) => {
  if (!isTrustedIpcSender(event)) {
    event.returnValue = { ok: false, error: "Émetteur IPC non autorisé." };
    return;
  }
  event.returnValue = durableStore.remove(key);
});

ipcMain.on("storage:status", (event) => {
  if (!isTrustedIpcSender(event)) {
    event.returnValue = { ok: false, error: "Émetteur IPC non autorisé." };
    return;
  }
  event.returnValue = durableStore.status();
});

ipcMain.handle("storage:export", async () => {
  const result = await dialog.showSaveDialog(mainWindow ?? undefined, {
    title: "Exporter les données AppPublisher",
    defaultPath: `apppublisher-data-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "Données AppPublisher", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  fs.writeFileSync(result.filePath, `${JSON.stringify(durableStore.snapshot(), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return result.filePath;
});

ipcMain.handle("storage:import", async () => {
  const selected = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Importer des données AppPublisher",
    properties: ["openFile"],
    filters: [{ name: "Données AppPublisher", extensions: ["json"] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const source = selected.filePaths[0];
  const stat = fs.statSync(source);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) {
    throw new Error("Le fichier sélectionné est invalide ou trop volumineux.");
  }
  const document = JSON.parse(fs.readFileSync(source, "utf8"));
  if (!validateDocument(document)) {
    throw new Error("Ce fichier n'est pas un export AppPublisher valide.");
  }
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Remplacer les données locales ?",
    message: "L'import va remplacer les projets, réglages et historiques actuels.",
    detail:
      "Une sauvegarde automatique du fichier de données actuel sera conservée. " +
      "Les mots de passe du trousseau système ne sont jamais contenus dans un export.",
    buttons: ["Importer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return null;
  const imported = durableStore.replace(document);
  if (!imported.ok) throw new Error(imported.error);
  return { path: source, keys: imported.keys };
});

/* ---------- Menu Diagnostic (accès rapide au fichier de log) ---------- */

function setupDiagnosticMenu() {
  try {
    const template = [];
    if (process.platform === "darwin") {
      template.push({ role: "appMenu" });
    }
    template.push(
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
      {
        label: "Diagnostic",
        submenu: [
          {
            label: "Ouvrir le journal de diagnostic",
            accelerator: "CmdOrCtrl+Alt+D",
            click: async () => {
              diagWrite({ level: "menu", message: "Diagnostic → Ouvrir le journal" });
              try {
                await shell.openPath(currentLogFile());
              } catch (e) {
                diagWrite({ level: "error", message: "menu open failed", error: String(e) });
              }
            },
          },
          {
            label: "Révéler le fichier dans le Finder / l'Explorateur",
            click: () => {
              diagWrite({ level: "menu", message: "Diagnostic → Révéler" });
              try {
                shell.showItemInFolder(currentLogFile());
              } catch (e) {
                diagWrite({ level: "error", message: "menu reveal failed", error: String(e) });
              }
            },
          },
          { type: "separator" },
          {
            label: "Ouvrir la console de diagnostic",
            accelerator: "CmdOrCtrl+Shift+L",
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("diag:navigate", "/logs");
              }
            },
          },
          {
            label: "Copier le chemin du fichier",
            click: () => {
              try {
                clipboard.writeText(currentLogFile());
              } catch (e) {
                diagWrite({ level: "error", message: "menu copy failed", error: String(e) });
              }
            },
          },
          {
            label: "Recharger la fenêtre",
            accelerator: "CmdOrCtrl+R",
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
            },
          },
          ...(isDev
            ? [
                {
                  label: "Outils de développement",
                  accelerator: "CmdOrCtrl+Alt+I",
                  click: () => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.openDevTools({ mode: "detach" });
                    }
                  },
                },
              ]
            : []),
        ],
      },
    );
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    diagWrite({ level: "info", message: "Diagnostic menu installé" });
  } catch (e) {
    diagWrite({ level: "error", message: "setupDiagnosticMenu failed", error: String(e) });
  }
}

/* ---------- Sécurité : validation des arguments de processus ---------- */

// Caractères interdits dans un argument passé à `spawn` (audit I3/M11).
//
// On lance TOUJOURS avec `shell: false` : le shell utilisateur n'interprète
// jamais l'argument, seuls le NUL et les nouvelles lignes (qui pourraient
// tronquer un argument côté OS/logs) restent réellement dangereux.
// Le backslash `\` a été retiré volontairement : c'est le séparateur natif
// des chemins Windows (`C:\Users\…\gradlew.bat`) et son interdiction rendait
// tout `exec:run` inopérant sur cette plateforme.
const ARG_FORBIDDEN = /[\n\r\u0000]/;

function firstForbiddenChar(a) {
  const m = typeof a === "string" ? a.match(ARG_FORBIDDEN) : null;
  if (!m) return null;
  const c = m[0];
  if (c === "\n") return "\\n";
  if (c === "\r") return "\\r";
  if (c === "\u0000") return "NUL";
  return c;
}

function findUnsafeArg(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a !== "string") return { index: i, reason: "type non-string" };
    if (a.length > 4096) return { index: i, reason: "argument > 4096 caractères" };
    const bad = firstForbiddenChar(a);
    if (bad) return { index: i, reason: `caractère interdit '${bad}'` };
  }
  return null;
}

/* ---------- Persistance des dimensions de la fenêtre ---------- */

const windowStatePath = path.join(app.getPath("userData"), "window-state.json");

function readWindowState() {
  try {
    const raw = fs.readFileSync(windowStatePath, "utf8");
    const s = JSON.parse(raw);
    if (
      typeof s.width === "number" &&
      typeof s.height === "number" &&
      s.width >= 800 &&
      s.height >= 500
    ) {
      return s;
    }
  } catch {}
  return null;
}

function writeWindowState(win) {
  try {
    if (!win || win.isDestroyed()) return;
    const bounds = win.getBounds();
    const state = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized(),
    };
    fs.mkdirSync(path.dirname(windowStatePath), { recursive: true });
    fs.writeFileSync(windowStatePath, JSON.stringify(state), "utf8");
  } catch {
    // Non bloquant.
  }
}

/* ---------- Fenêtre ---------- */

function createWindow() {
  const saved = readWindowState();
  const win = new BrowserWindow({
    width: saved?.width ?? 1200,
    height: saved?.height ?? 820,
    x: saved?.x,
    y: saved?.y,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0b0b0f",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: isDev,
    },
  });
  win.once("ready-to-show", () => {
    win.show();
    if (saved?.maximized) win.maximize();
  });
  win.on("close", () => writeWindowState(win));

  win.webContents.on("did-fail-load", (_e, code, desc) => {
    // Uniquement journalisé — on ne relance pas automatiquement pour éviter
    // les boucles. L'utilisateur peut relancer l'application.
    console.error(`[AppPublisher] chargement échoué (${code}) : ${desc}`);
  });
  const senderId = win.webContents.id;
  trustedWebContentsIds.add(senderId);
  win.webContents.once("destroyed", () => {
    trustedWebContentsIds.delete(senderId);
    activeExecutions.cancelSender(senderId);
    signingSessions.clearSender(senderId);
  });

  const indexPath = path.join(__dirname, "..", "dist", "index.html");
  installWindowGuards(win, {
    devUrl: isDev ? process.env.APPPUBLISHER_DEV_URL : undefined,
    indexPath,
  });
  mainWindow = win;

  if (isDev) win.loadURL(process.env.APPPUBLISHER_DEV_URL);
  else win.loadFile(indexPath);

  return win;
}

/* ---------- Menu "À propos" (macOS) ---------- */

function configureAboutPanel() {
  let pkgVersion = app.getVersion();
  try {
    const versionJsonPath = path.join(__dirname, "..", "version.json");
    if (fs.existsSync(versionJsonPath)) {
      const v = JSON.parse(fs.readFileSync(versionJsonPath, "utf8"));
      if (v?.version) pkgVersion = v.version;
    }
  } catch {}
  app.setAboutPanelOptions({
    applicationName: "AppPublisher",
    applicationVersion: pkgVersion,
    copyright: `Copyright © ${new Date().getFullYear()} Tim C.`,
    credits: "Assistant de publication d'applications multiplateformes.",
  });
}

/* ---------- Robustesse : erreurs non capturées ---------- */

process.on("uncaughtException", (err) => {
  console.error("[AppPublisher] uncaughtException:", err);
  try {
    dialog.showErrorBox(
      "AppPublisher a rencontré un problème",
      "Une erreur inattendue est survenue. L'application reste utilisable ; " +
        "si le problème persiste, fermez puis rouvrez AppPublisher.\n\n" +
        String(err?.message ?? err),
    );
  } catch {}
});
process.on("unhandledRejection", (reason) => {
  console.error("[AppPublisher] unhandledRejection:", reason);
});

/* ---------- Instance unique ---------- */

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Séquence de démarrage explicite. Chaque étape est isolée : une étape
// annexe qui échoue (menu, panneau About, restauration des racines) ne
// doit JAMAIS empêcher la création de la fenêtre principale — sinon
// l'utilisateur voit une app fantôme sans UI et sans message d'erreur.
function safeStep(name, fn) {
  try {
    diagWrite({ level: "info", message: `boot step start: ${name}` });
    const result = fn();
    diagWrite({ level: "info", message: `boot step ok: ${name}` });
    return result;
  } catch (e) {
    diagWrite({
      level: "error",
      message: `boot step failed: ${name}`,
      error: String((e && e.stack) || e),
    });
    return undefined;
  }
}

app
  .whenReady()
  .then(() => {
    diagWrite({ level: "info", message: "app whenReady" });

    safeStep("restore-known-roots", () => {
      const restored = projectAccess.load();
      const keystores = keystoreAccess.load();
      const keystoreOutputFolders = keystoreOutputAccess.load();
      const trusted = trustStore.load(projectAccess);
      diagWrite({
        level: "info",
        message: "known-roots restored",
        ctx: {
          count: restored.length,
          keystores: keystores.length,
          keystoreOutputFolders: keystoreOutputFolders.length,
          trustedProjects: trusted.length,
        },
      });
    });

    safeStep("deny-electron-permissions", () => {
      session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
        return permission === "notifications" && trustedWebContentsIds.has(webContents?.id);
      });
      session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(permission === "notifications" && trustedWebContentsIds.has(webContents?.id));
      });
    });

    safeStep("about-panel", () => configureAboutPanel());
    safeStep("diagnostic-menu", () => setupDiagnosticMenu());

    // createWindow est la SEULE étape non-optionnelle : si elle échoue,
    // l'app n'a pas d'UI et doit quitter proprement plutôt que de rester
    // en tâche de fond invisible.
    try {
      diagWrite({ level: "info", message: "boot step start: createWindow" });
      createWindow();
      diagWrite({ level: "info", message: "boot step ok: createWindow" });
    } catch (e) {
      diagWrite({
        level: "fatal",
        message: "createWindow failed — quitting",
        error: String((e && e.stack) || e),
      });
      app.quit();
      return;
    }

    app.on("activate", () => {
      diagWrite({ level: "info", message: "app activate" });
      if (BrowserWindow.getAllWindows().length === 0)
        safeStep("createWindow(activate)", createWindow);
    });
  })
  .catch((e) => {
    // Filet de sécurité : une rejection non gérée du .then ci-dessus
    // laisserait l'app zombie. On log et on quitte.
    diagWrite({
      level: "fatal",
      message: "whenReady chain rejected",
      error: String((e && e.stack) || e),
    });
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  activeExecutions.cancelAll();
  signingSessions.clear();
});

/* ---------- IPC : System ---------- */

function runCapture(cmd, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    let done = false;
    try {
      const p = spawn(cmd, args, { shell: false, env: process.env });
      const t = setTimeout(() => {
        if (!done) {
          p.kill();
          resolve({ ok: false, out, err: err + "\n[timeout]" });
        }
      }, timeoutMs);
      p.stdout?.on("data", (d) => (out += d.toString()));
      p.stderr?.on("data", (d) => (err += d.toString()));
      p.on("error", () => {
        done = true;
        clearTimeout(t);
        resolve({ ok: false, out, err });
      });
      p.on("close", (code) => {
        done = true;
        clearTimeout(t);
        resolve({ ok: code === 0, out: out.trim(), err: err.trim() });
      });
    } catch (e) {
      resolve({ ok: false, out: "", err: String(e) });
    }
  });
}

async function detectSystem() {
  const [node, npm, git, java] = await Promise.all([
    runCapture("node", ["-v"]),
    runCapture(process.platform === "win32" ? "npm.cmd" : "npm", ["-v"]),
    runCapture("git", ["--version"]),
    runCapture("java", ["-version"]),
  ]);

  const androidHome = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || guessAndroidSdk();
  const androidStudio = guessAndroidStudio();
  const internet = await pingInternet();

  return {
    platform: process.platform,
    node: node.ok ? node.out.replace(/^v/, "") : undefined,
    npm: npm.ok ? npm.out : undefined,
    git: git.ok ? (git.out.match(/\d+\.\d+\.\d+/)?.[0] ?? git.out) : undefined,
    java:
      java.ok || java.err
        ? ((java.err || java.out).split("\n")[0].match(/"([^"]+)"/)?.[1] ?? "installé")
        : undefined,
    androidStudio,
    androidSdk: androidHome ? readSdkVersion(androidHome) : undefined,
    androidSdkPath: androidHome,
    androidHome,
    javaHome: process.env.JAVA_HOME,
    internet,
  };
}

function guessAndroidSdk() {
  const home = os.homedir();
  const candidates =
    process.platform === "darwin"
      ? [path.join(home, "Library/Android/sdk")]
      : process.platform === "win32"
        ? [path.join(process.env.LOCALAPPDATA || "", "Android/Sdk")]
        : [path.join(home, "Android/Sdk")];
  return candidates.find((p) => p && fs.existsSync(p));
}

function guessAndroidStudio() {
  if (process.platform === "darwin") {
    return fs.existsSync("/Applications/Android Studio.app") ? "installé" : undefined;
  }
  if (process.platform === "win32") {
    const p = path.join(process.env.LOCALAPPDATA || "", "Programs/Android Studio");
    return fs.existsSync(p) ? "installé" : undefined;
  }
  return undefined;
}

function readSdkVersion(sdkPath) {
  try {
    const platforms = path.join(sdkPath, "platforms");
    if (!fs.existsSync(platforms)) return undefined;
    const versions = fs
      .readdirSync(platforms)
      .filter((n) => n.startsWith("android-"))
      .map((n) => parseInt(n.replace("android-", ""), 10))
      .filter((n) => !Number.isNaN(n));
    if (!versions.length) return undefined;
    return String(Math.max(...versions));
  } catch {
    return undefined;
  }
}

function pingInternet() {
  return new Promise((resolve) => {
    const req = https.request(
      { host: "clients3.google.com", path: "/generate_204", method: "HEAD", timeout: 2000 },
      (res) => {
        resolve(res.statusCode === 204 || (res.statusCode ?? 0) < 400);
        res.resume();
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

ipcMain.handle("system:detect", detectSystem);
ipcMain.handle("system:copyText", (_event, value) => {
  if (typeof value !== "string" || value.length > 2_000_000) return false;
  clipboard.writeText(value);
  return clipboard.readText() === value;
});

/* ---------- IPC : Projects ---------- */

function detectProjectFiles(projectPath) {
  const exists = (rel) => fs.existsSync(path.join(projectPath, rel));
  const readTextSafe = (rel) => {
    try {
      return fs.readFileSync(path.join(projectPath, rel), "utf8");
    } catch {
      return null;
    }
  };
  const hasCapCfg =
    exists("capacitor.config.ts") ||
    exists("capacitor.config.js") ||
    exists("capacitor.config.json");

  let pkgName;
  let pkgDisplayName;
  let versionJson;
  try {
    if (exists("package.json")) {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8"));
      pkgName = typeof pkg.name === "string" ? pkg.name : undefined;
      pkgDisplayName = typeof pkg.displayName === "string" ? pkg.displayName : undefined;
    }
    if (exists("version.json")) {
      versionJson = JSON.parse(fs.readFileSync(path.join(projectPath, "version.json"), "utf8"));
    }
  } catch {}

  // 1. capacitor.config.* → appName
  let capacitorAppName;
  for (const rel of ["capacitor.config.json", "capacitor.config.ts", "capacitor.config.js"]) {
    if (!exists(rel)) continue;
    const raw = readTextSafe(rel);
    if (!raw) continue;
    if (rel.endsWith(".json")) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.appName === "string" && parsed.appName.trim()) {
          capacitorAppName = parsed.appName.trim();
          break;
        }
      } catch {}
    } else {
      const m = raw.match(/appName\s*:\s*['"`]([^'"`]+)['"`]/);
      if (m && m[1].trim()) {
        capacitorAppName = m[1].trim();
        break;
      }
    }
  }

  // 2. android/app/src/main/res/values/strings.xml → app_name
  let androidAppName;
  const stringsRel = path.join("android", "app", "src", "main", "res", "values", "strings.xml");
  if (exists(stringsRel)) {
    const raw = readTextSafe(stringsRel);
    if (raw) {
      const m = raw.match(/<string\s+name=["']app_name["']\s*>([\s\S]*?)<\/string>/);
      if (m && m[1].trim()) androidAppName = m[1].trim();
    }
  }

  const displayName = capacitorAppName || androidAppName || pkgDisplayName || pkgName || undefined;
  let androidPreparation;
  try {
    androidPreparation = inspectAndroidPreparation(projectPath);
  } catch {}

  return {
    hasPackageJson: exists("package.json"),
    hasVersionJson: exists("version.json"),
    hasCapacitorConfig: hasCapCfg,
    hasAndroid: exists("android"),
    hasIos: exists("ios"),
    hasVersionScript: exists("scripts/version.mjs"),
    hasGradleWrapper:
      exists(path.join("android", "gradlew")) || exists(path.join("android", "gradlew.bat")),
    hasChangelog: exists("CHANGELOG.md"),
    packageName: pkgName,
    displayName,
    currentVersion: versionJson?.version,
    currentBuild: versionJson?.build,
    androidReadiness: androidPreparation?.status,
    androidReadinessReason: androidPreparation?.blockers?.[0],
    packageManager: androidPreparation?.packageManager,
    webBuildScript: androidPreparation?.buildScript,
    webOutputDir: androidPreparation?.webDir,
    capacitorAppId: androidPreparation?.applicationId,
  };
}

ipcMain.handle("projects:detect", (_e, projectPath) => {
  const safe = resolveWithinAllowed(projectPath);
  if (!safe) return null;
  return detectProjectFiles(safe);
});

ipcMain.handle("projects:scan", (_e, rootPath) => {
  const safe = resolveWithinAllowed(rootPath);
  if (!safe) return [];
  try {
    const dirs = fs
      .readdirSync(safe, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."));
    const results = [];
    for (const d of dirs) {
      const p = path.join(safe, d.name);
      const detected = detectProjectFiles(p);
      if (detected.hasPackageJson) {
        results.push({
          path: p,
          name: detected.displayName || detected.packageName || d.name,
          detected,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
});

ipcMain.handle("projects:chooseFolder", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  if (r.canceled || !r.filePaths[0]) return null;
  const authorized = registerAllowedRoot(r.filePaths[0]);
  if (!authorized) {
    throw new Error(
      "Ce dossier est trop large ou inaccessible. Sélectionnez directement le dossier du projet.",
    );
  }
  return authorized;
});

ipcMain.handle("projects:reauthorizeFolder", async (_e, expectedPath) => {
  if (typeof expectedPath !== "string" || expectedPath.length > 4096) return null;
  const r = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Réautoriser le dossier du projet",
    message: "Sélectionnez exactement le dossier déjà associé à ce projet.",
    properties: ["openDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  let expectedReal;
  let selectedReal;
  try {
    expectedReal = fs.realpathSync(expectedPath);
    selectedReal = fs.realpathSync(r.filePaths[0]);
  } catch {
    return null;
  }
  const same =
    process.platform === "win32"
      ? expectedReal.toLowerCase() === selectedReal.toLowerCase()
      : expectedReal === selectedReal;
  if (!same) return null;
  return registerAllowedRoot(selectedReal);
});

/* ---------- IPC : dépôts Git gérés ---------- */

ipcMain.handle("git:inspectRemote", (_e, remoteUrl) => gitProjectManager.inspectRemote(remoteUrl));

ipcMain.handle("git:clone", async (_e, args) => {
  const result = await gitProjectManager.clone(args);
  const authorized = registerAllowedRoot(result.localPath);
  if (!authorized) throw new Error("La copie Git n’a pas pu être autorisée par AppPublisher.");
  return { ...result, localPath: authorized, detected: detectProjectFiles(authorized) };
});

ipcMain.handle("git:status", (_e, args) => gitProjectManager.status(args));

ipcMain.handle("git:check", (_e, args) => gitProjectManager.check(args));

ipcMain.handle("git:sync", async (_e, args) => {
  const result = await gitProjectManager.sync(args);
  const safe = resolveWithinAllowed(args?.projectPath);
  if (!safe) throw new Error("La copie locale du projet n’est plus autorisée.");
  return { ...result, detected: detectProjectFiles(safe) };
});

/* ---------- IPC : préparation Android guidée ---------- */

ipcMain.handle("android-preparation:inspect", (_e, projectPath) =>
  androidPreparationManager.inspect(projectPath),
);

ipcMain.handle("android-preparation:beginRollbackGuard", (_e, projectPath, request) =>
  androidPreparationManager.beginRollbackGuard(projectPath, request),
);

ipcMain.handle("android-preparation:rollbackCreatedArtifacts", (_e, projectPath, token) =>
  androidPreparationManager.rollbackCreatedArtifacts(projectPath, token),
);

ipcMain.handle("android-preparation:completeRollbackGuard", (_e, projectPath, token) =>
  androidPreparationManager.completeRollbackGuard(projectPath, token),
);

ipcMain.handle("android-preparation:createConfig", async (_e, projectPath, request) => {
  const project = resolveWithinAllowed(projectPath);
  if (!project) throw new Error("Projet non autorisé.");
  const trusted = await ensureProjectTrusted(project, trustStore, confirmProjectTrust);
  if (!trusted) throw new Error("Préparation Android annulée par l’utilisateur.");
  return androidPreparationManager.createConfig(project, request);
});

/* ---------- IPC : corrections Android guidées ---------- */

ipcMain.handle("android-corrections:preview", (_e, projectPath, desired) =>
  publicPlan(androidCorrectionManager.preview(projectPath, desired)),
);

ipcMain.handle("android-corrections:apply", async (_e, projectPath, desired, token) => {
  const project = resolveWithinAllowed(projectPath);
  if (!project) throw new Error("Projet non autorisé.");
  const trusted = await ensureProjectTrusted(project, trustStore, confirmProjectTrust);
  if (!trusted) throw new Error("Correction Android annulée par l’utilisateur.");

  const plan = androidCorrectionManager.preview(project, desired);
  if (plan.token !== token) {
    throw new Error("Le projet a changé depuis la prévisualisation. Relancez l'analyse.");
  }
  if (!plan.canApply) throw new Error(plan.blocked[0] ?? "Aucune correction sûre à appliquer.");
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: plan.sensitive ? "warning" : "question",
    title: plan.sensitive
      ? "Confirmer la correction de l'identité Android"
      : "Appliquer les corrections Android ?",
    message: plan.sensitive
      ? "Le package Android identifie définitivement l'application sur Google Play."
      : `${plan.actions.length} correction${plan.actions.length > 1 ? "s" : ""} prête${plan.actions.length > 1 ? "s" : ""} à être appliquée${plan.actions.length > 1 ? "s" : ""}.`,
    detail: `${plan.actions.map((action) => `• ${action.title} — ${action.file}`).join("\n")}\n\nUne sauvegarde vérifiée sera créée avant toute écriture.`,
    buttons: ["Appliquer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return { applied: false, cancelled: true };

  const backup = backupManager.create(project, "correction");
  const result = androidCorrectionManager.apply(project, desired, token);
  return { ...result, backup };
});

/* ---------- IPC : Gradle (opérations dédiées) ---------- */

ipcMain.handle("gradle:ensureExecutable", (_e, projectPath) =>
  ensureGradleWrapperExecutable(projectPath, resolveWithinAllowed),
);

ipcMain.handle("gradle:ensureSigningPatch", async (_e, androidDirInput) => {
  const androidDir = resolveWithinAllowed(androidDirInput);
  if (!androidDir || path.basename(androidDir) !== "android") {
    return { ok: false, errorCode: "project-not-authorized" };
  }
  const projectRoot = findProjectRoot(androidDir, projectAccess);
  if (!projectRoot || path.dirname(androidDir) !== projectRoot) {
    return { ok: false, errorCode: "project-not-authorized" };
  }
  const trusted = await ensureProjectTrusted(projectRoot, trustStore, confirmProjectTrust);
  if (!trusted) throw new Error("Exécution du projet non autorisée par l'utilisateur.");
  const target = resolveWithinAllowed(path.join(androidDir, "app", "build.gradle"));
  if (!target) return { ok: false, errorCode: "gradle-missing" };
  let current;
  try {
    current = fs.readFileSync(target, "utf8");
  } catch {
    return { ok: false, errorCode: "gradle-missing" };
  }
  const patched = buildPatchedGradle(current);
  if (!patched.ok) return patched;
  if (!patched.changed) return { ok: true, changed: false };
  const temporary = `${target}.apppublisher-${process.pid}`;
  try {
    fs.writeFileSync(temporary, patched.content, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
    const verified = fs.readFileSync(target, "utf8") === patched.content;
    return verified
      ? { ok: true, changed: true }
      : { ok: false, changed: true, errorCode: "write-failed" };
  } catch {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    return { ok: false, errorCode: "write-failed" };
  }
});

/* ---------- IPC : sauvegardes dédiées ---------- */

ipcMain.handle("backups:create", (_e, projectPath, reason) => {
  return backupManager.create(projectPath, reason);
});

ipcMain.handle("backups:restore", async (_e, projectPath, location, files) => {
  const project = resolveWithinAllowed(projectPath);
  if (!project) throw new Error("Projet non autorisé.");
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Restaurer cette sauvegarde ?",
    message: `Les fichiers actuels de « ${path.basename(project)} » vont être remplacés.`,
    detail:
      "AppPublisher vérifiera intégralement le snapshot avant de modifier le premier fichier.",
    buttons: ["Restaurer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) throw new Error("Restauration annulée.");
  return backupManager.restore(projectPath, location, files);
});

/* ---------- IPC : Exec (streaming) ---------- */

ipcMain.handle("exec:run", async (event, opts, channel, executionId) => {
  const start = Date.now();
  const failed = (message) => ({
    exitCode: -1,
    stdout: "",
    stderr: redactSensitiveText(message, [...knownSecretValues]),
    durationMs: Date.now() - start,
    aborted: false,
  });

  if (!opts || typeof opts !== "object") return failed("Requête invalide.");
  if (executionId != null && !isValidExecutionId(executionId)) {
    return failed("Identifiant d'exécution invalide.");
  }
  if (channel != null && !/^exec-[a-z0-9_-]{6,80}$/i.test(channel)) {
    return failed("Canal de suivi invalide.");
  }
  const args = Array.isArray(opts.args) ? opts.args : [];
  const unsafe = findUnsafeArg(args);
  if (unsafe) return failed(`Argument invalide #${unsafe.index + 1} : ${unsafe.reason}.`);

  const policy = validateExecutionRequest(opts, projectAccess);
  if (!policy.ok) return failed(policy.error);
  if (policy.requiresTrust) {
    const trusted = await ensureProjectTrusted(policy.projectRoot, trustStore, confirmProjectTrust);
    if (!trusted) return failed("Exécution annulée : ce projet n'a pas été approuvé.");
  }

  let safeEnv = {};
  if (policy.envAllowed) {
    safeEnv = signingSessions.consume(event.sender.id, opts.signingSessionId, policy.projectRoot);
    if (!safeEnv) {
      return failed("Session de signature absente, expirée ou déjà utilisée.");
    }
    for (const [key, value] of Object.entries(safeEnv)) {
      if (/(?:PASS|TOKEN|SECRET)/i.test(key) && value.length >= 4) {
        knownSecretValues.add(value);
      }
    }
  } else if (opts.signingSessionId != null) {
    return failed("Session de signature interdite pour cette opération.");
  }

  const output = new RedactedOutputCollector(Object.values(safeEnv));
  const emitLines = (stream, lines) => {
    if (!channel || event.sender.isDestroyed()) return;
    for (const line of lines) {
      if (!line.length) continue;
      try {
        event.sender.send(channel, { stream, line });
      } catch {}
    }
  };

  return new Promise((resolve) => {
    let aborted = false;
    let settled = false;
    let timer = null;
    const timeoutMs = Math.min(Number(opts?.timeoutMs) || 10 * 60 * 1000, 30 * 60 * 1000);

    const settle = (exitCode, error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) output.append("stderr", `\n${String(error)}`);
      emitLines("stdout", output.flush("stdout"));
      emitLines("stderr", output.flush("stderr"));
      if (isValidExecutionId(executionId)) {
        activeExecutions.release(event.sender.id, executionId);
      }
      resolve({
        exitCode,
        stdout: output.result("stdout"),
        stderr: output.result("stderr"),
        durationMs: Date.now() - start,
        aborted,
      });
    };

    try {
      const requestedCommand = policy.command === "gradlew" ? "./gradlew" : policy.command;
      const command = normalizeSpawnCommand(requestedCommand);
      const child = spawn(command, args, {
        cwd: policy.cwd,
        env: { ...process.env, ...safeEnv },
        shell: false,
        detached: process.platform !== "win32",
      });
      if (
        isValidExecutionId(executionId) &&
        !activeExecutions.register(event.sender.id, executionId, child, () => {
          aborted = true;
        })
      ) {
        terminateProcessTree(child);
        output.append("stderr", "Une exécution portant cet identifiant est déjà active.");
        return settle(-1);
      }
      timer = setTimeout(() => {
        aborted = true;
        if (isValidExecutionId(executionId)) {
          activeExecutions.cancel(event.sender.id, executionId);
        } else {
          terminateProcessTree(child);
        }
      }, timeoutMs);

      const push = (stream, data) => {
        emitLines(stream, output.append(stream, data.toString()));
      };

      child.stdout?.on("data", (d) => push("stdout", d));
      child.stderr?.on("data", (d) => push("stderr", d));
      child.on("error", (e) => {
        settle(-1, e);
      });
      child.on("close", (code) => {
        settle(code ?? 0);
      });
    } catch (e) {
      settle(-1, e);
    }
  });
});

ipcMain.handle("exec:cancel", (event, executionId) => {
  return activeExecutions.cancel(event.sender.id, executionId);
});

/* ---------- IPC : FS (lecture confinée) ---------- */

ipcMain.handle("fs:exists", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return false;
  return fs.existsSync(safe);
});

ipcMain.handle("fs:readJson", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return null;
  try {
    return JSON.parse(fs.readFileSync(safe, "utf8"));
  } catch {
    return null;
  }
});

ipcMain.handle("fs:readText", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return null;
  try {
    return fs.readFileSync(safe, "utf8");
  } catch {
    return null;
  }
});

ipcMain.handle("fs:stat", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return null;
  try {
    const s = fs.statSync(safe);
    return { size: s.size, isFile: s.isFile(), isDir: s.isDirectory() };
  } catch {
    return null;
  }
});

ipcMain.handle("fs:listDir", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return [];
  try {
    return fs.readdirSync(safe);
  } catch {
    return [];
  }
});

ipcMain.handle("fs:findByExtension", (_e, dir, ext, maxDepth = 6) => {
  const safe = resolveWithinAllowed(dir);
  if (!safe) return [];
  if (typeof ext !== "string" || !/^\.[A-Za-z0-9]{1,10}$/.test(ext)) return [];
  const depthLimit = Math.min(Math.max(Number(maxDepth) || 6, 1), 12);
  const results = [];
  function walk(d, depth) {
    if (depth > depthLimit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (!resolveWithinAllowed(p)) continue;
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(ext)) results.push(p);
    }
  }
  walk(safe, 0);
  return results;
});

/* ---------- IPC : Shell ---------- */

// openFolder accepte un dossier OU un fichier : dans ce dernier cas on ouvre
// le dossier parent. Le renderer peut ainsi passer directement le chemin
// du .aab produit par le build.
ipcMain.handle("shell:openFolder", async (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) throw new Error("Chemin non autorisé.");
  try {
    const st = fs.statSync(safe);
    const target = st.isDirectory() ? safe : path.dirname(safe);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
  } catch (error) {
    throw new Error(`Impossible d'ouvrir le dossier : ${String(error?.message ?? error)}`);
  }
});

ipcMain.handle("shell:revealItem", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) throw new Error("Chemin non autorisé.");
  if (!fs.existsSync(safe)) throw new Error("Le fichier demandé n'existe plus.");
  shell.showItemInFolder(safe);
});

ipcMain.handle("shell:openExternal", async (_e, url) => {
  const safeUrl = sanitizeExternalUrl(url);
  if (!safeUrl) return false;
  try {
    await shell.openExternal(safeUrl);
    return true;
  } catch {
    return false;
  }
});

/* ---------- IPC : Net ---------- */

ipcMain.handle("net:online", pingInternet);

/* ==========================================================================
 *  IPC : Android Signing Manager
 *
 *  Objectifs sécurité :
 *   - `keytool` et `security` ne sont JAMAIS exposés via `exec:run`.
 *     Ils ne sont invoqués qu'à travers les handlers dédiés ci-dessous,
 *     qui construisent eux-mêmes la ligne de commande et refusent tout
 *     argument non validé.
 *   - Les mots de passe transitent uniquement via l'environnement du
 *     process enfant (`-storepass:env`, `-keypass:env`). Ils n'apparaissent
 *     jamais en argv (`ps` ne les voit pas) ni dans les logs diagnostic
 *     (les handlers filtrent explicitement `ctx.storepass`/`keypass`).
 *   - Les chemins keystore résident souvent hors des racines projet. Une
 *     autorisation persistante et limitée au fichier exact est créée après
 *     sélection native ; son dossier parent n'est jamais exposé au renderer.
 * ========================================================================== */

function registerAllowedKeystore(p) {
  try {
    if (!p || typeof p !== "string") return null;
    const real = fs.realpathSync(p);
    const st = fs.statSync(real);
    if (!st.isFile()) return null;
    const lower = real.toLowerCase();
    if (!lower.endsWith(".jks") && !lower.endsWith(".keystore")) return null;
    return keystoreAccess.approveExisting(real);
  } catch {
    return null;
  }
}

function resolveKeystorePath(inputPath) {
  if (typeof inputPath !== "string") return null;
  try {
    const real = fs.realpathSync(inputPath);
    if (keystoreAccess.resolveExisting(real)) return real;
    // Autorise également si le fichier vit dans une racine projet connue.
    if (resolveWithinAllowed(real)) return real;
    return null;
  } catch {
    return null;
  }
}

/** Retire les champs sensibles avant écriture dans le journal diagnostic. */
function scrubSecrets(ctx) {
  if (!ctx || typeof ctx !== "object") return ctx;
  const clean = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (/pass|secret|key$/i.test(k)) continue;
    clean[k] = v;
  }
  return clean;
}

function diagSigning(level, message, ctx) {
  try {
    diagWrite({ level, message: `signing: ${message}`, ctx: scrubSecrets(ctx) });
  } catch {}
}

/** Valide un DN simple pour `keytool -genkeypair`. */
function isValidDName(s) {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > 512) return false;
  if (/[\n\r\u0000]/.test(s)) return false;
  return true;
}

function isValidAlias(s) {
  if (typeof s !== "string") return false;
  if (s.length === 0 || s.length > 128) return false;
  // L'alias est transmis comme un argument spawn distinct (shell:false), puis
  // comme une valeur d'environnement Gradle. Les espaces et signes autorisés
  // par keytool sont donc sûrs ; seuls les caractères de contrôle sont refusés.
  return !/[\u0000-\u001f\u007f]/.test(s);
}

function isValidPassword(s) {
  return typeof s === "string" && s.length >= 6 && s.length <= 512 && !/[\n\r\u0000]/.test(s);
}

/**
 * Résout le chemin de l'exécutable keytool. Priorité :
 *   1. JAVA_HOME/bin/keytool
 *   2. keytool dans le PATH (résolu par spawn).
 */
function resolveKeytool() {
  const home = process.env.JAVA_HOME;
  if (home) {
    const candidate = path.join(
      home,
      "bin",
      process.platform === "win32" ? "keytool.exe" : "keytool",
    );
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return process.platform === "win32" ? "keytool.exe" : "keytool";
}

/**
 * Exécute keytool sans passer par `exec:run` (aucune interaction avec
 * l'allowlist utilisateur). Renvoie `{ code, stdout, stderr }`.
 * `env` reçoit STOREPASS/KEYPASS de sorte que les mots de passe ne
 * traversent jamais argv.
 */
function runKeytool(args, env = {}, timeoutMs = 30_000) {
  return new Promise((resolve) => {
    const bin = resolveKeytool();
    const child = spawn(bin, args, {
      env: { ...process.env, ...env },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ code: -1, stdout, stderr: stderr + "\n[timeout]", timedOut: true });
    }, timeoutMs);
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: `${stderr}\n${String(e)}`, spawnError: e });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function classifyKeytoolStderr(stderr) {
  const s = (stderr || "").toLowerCase();
  if (
    s.includes("password was incorrect") ||
    s.includes("keystore was tampered") ||
    s.includes("password verification failed")
  )
    return "wrong-password";
  if (s.includes("alias") && (s.includes("does not exist") || s.includes("n'existe pas")))
    return "alias-not-found";
  if (s.includes("invalid keystore format") || s.includes("not a valid keystore"))
    return "invalid-keystore";
  return "unknown";
}

/* ---------- Handler : chooseKeystore ---------- */

ipcMain.handle("signing:chooseKeystore", async () => {
  const r = await dialog.showOpenDialog({
    title: "Choisir un fichier .jks ou .keystore",
    properties: ["openFile"],
    filters: [{ name: "Keystore Android", extensions: ["jks", "keystore"] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const real = registerAllowedKeystore(r.filePaths[0]);
  if (!real) {
    diagSigning("warn", "chooseKeystore: fichier refusé", { path: r.filePaths[0] });
    return null;
  }
  diagSigning("info", "chooseKeystore: accepté", { path: real });
  return real;
});

ipcMain.handle("signing:chooseOutputFolder", async () => {
  const r = await dialog.showOpenDialog({
    title: "Dossier de destination du keystore",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const authorized = keystoreOutputAccess.approveExisting(r.filePaths[0]);
  if (!authorized) {
    throw new Error(
      "Ce dossier est trop large ou inaccessible. Créez puis sélectionnez un sous-dossier dédié.",
    );
  }
  return authorized;
});

/* ---------- Handler : keystoreList ---------- */

ipcMain.handle("signing:keystoreList", async (_e, args) => {
  try {
    if (!args || typeof args !== "object") return { ok: false, errorCode: "unknown" };
    const { keystorePath, storepass, alias } = args;
    if (!isValidPassword(storepass))
      return {
        ok: false,
        errorCode: "wrong-password",
        errorHint: "Le mot de passe est vide ou invalide.",
      };
    if (alias !== undefined && alias !== "" && !isValidAlias(alias))
      return { ok: false, errorCode: "invalid-keystore", errorHint: "Alias invalide." };
    const safe = resolveKeystorePath(keystorePath);
    if (!safe)
      return {
        ok: false,
        errorCode: "file-missing",
        errorHint: "Le fichier keystore est introuvable ou non autorisé.",
      };
    if (!fs.existsSync(safe)) return { ok: false, errorCode: "file-missing" };

    // Stabilise les libellés de sortie sur toutes les langues système. Le
    // parseur conserve le support FR pour les anciennes sorties et les tests.
    const cmdArgs = [
      "-J-Duser.language=en",
      "-J-Duser.country=US",
      "-list",
      "-v",
      "-keystore",
      safe,
      "-storepass:env",
      "APPPUB_STOREPASS",
    ];
    if (alias) cmdArgs.push("-alias", alias);
    const r = await runKeytool(cmdArgs, { APPPUB_STOREPASS: storepass });
    if (r.spawnError && r.spawnError.code === "ENOENT") {
      diagSigning("error", "keystoreList: keytool introuvable");
      return {
        ok: false,
        errorCode: "keytool-missing",
        errorHint: "keytool est introuvable. Installez un JDK 17+.",
      };
    }
    if (r.code === 0) {
      diagSigning("info", "keystoreList: succès", { alias: alias || "(tous)" });
      return { ok: true, stdout: r.stdout };
    }
    const code = classifyKeytoolStderr(r.stderr);
    diagSigning("warn", "keystoreList: échec", { code });
    return { ok: false, errorCode: code };
  } catch (e) {
    diagSigning("error", "keystoreList: exception", { error: String(e) });
    return { ok: false, errorCode: "unknown" };
  }
});

/* ---------- Handler : keystoreCreate ---------- */

ipcMain.handle("signing:keystoreCreate", async (_e, args) => {
  try {
    if (!args || typeof args !== "object") return { ok: false, errorCode: "invalid-args" };
    const { keystorePath, alias, storepass, keypass, dname, validityDays, keyalg, keysize } = args;
    if (typeof keystorePath !== "string" || keystorePath.length === 0)
      return { ok: false, errorCode: "invalid-args" };
    if (!isValidAlias(alias))
      return {
        ok: false,
        errorCode: "invalid-args",
        errorHint: "Alias invalide (lettres, chiffres, . _ - uniquement).",
      };
    if (!isValidPassword(storepass) || !isValidPassword(keypass))
      return {
        ok: false,
        errorCode: "invalid-args",
        errorHint: "Les mots de passe doivent faire au moins 6 caractères.",
      };
    if (!isValidDName(dname))
      return {
        ok: false,
        errorCode: "invalid-args",
        errorHint: "Informations de certificat invalides.",
      };
    const validity = Math.max(1, Math.min(36500, Number(validityDays) || 10000));
    const alg = keyalg === "RSA" ? "RSA" : "RSA";
    const size = Math.max(2048, Math.min(8192, Number(keysize) || 2048));

    // Le dossier parent doit être une racine autorisée (dialog chooseOutputFolder).
    const parent = path.dirname(keystorePath);
    const safeParent = keystoreOutputAccess.resolveExisting(parent);
    if (!safeParent)
      return {
        ok: false,
        errorCode: "invalid-args",
        errorHint: "Dossier de destination non autorisé.",
      };
    const target = path.join(safeParent, path.basename(keystorePath));
    if (fs.existsSync(target))
      return {
        ok: false,
        errorCode: "file-exists",
        errorHint: "Un fichier existe déjà à cet emplacement.",
      };

    const cmdArgs = [
      "-genkeypair",
      "-keystore",
      target,
      "-storetype",
      "JKS",
      "-alias",
      alias,
      "-keyalg",
      alg,
      "-keysize",
      String(size),
      "-validity",
      String(validity),
      "-dname",
      dname,
      "-storepass:env",
      "APPPUB_STOREPASS",
      "-keypass:env",
      "APPPUB_KEYPASS",
    ];
    const r = await runKeytool(
      cmdArgs,
      {
        APPPUB_STOREPASS: storepass,
        APPPUB_KEYPASS: keypass,
      },
      60_000,
    );
    if (r.spawnError && r.spawnError.code === "ENOENT") {
      diagSigning("error", "keystoreCreate: keytool introuvable");
      return { ok: false, errorCode: "keytool-missing" };
    }
    if (r.code === 0 && fs.existsSync(target)) {
      keystoreAccess.approveExisting(target);
      diagSigning("info", "keystoreCreate: succès", { alias, path: target });
      return { ok: true };
    }
    diagSigning("warn", "keystoreCreate: échec", { code: r.code });
    return {
      ok: false,
      errorCode: "unknown",
      errorHint: r.stderr?.split("\n")?.[0]?.slice(0, 200),
    };
  } catch (e) {
    diagSigning("error", "keystoreCreate: exception", { error: String(e) });
    return { ok: false, errorCode: "unknown" };
  }
});

/* ---------- Handler : signing:scan (ciblé, jamais tout le disque) ---------- */

ipcMain.handle("signing:scan", async (_e, roots) => {
  if (!Array.isArray(roots)) return [];
  const results = [];
  const seen = new Set();
  const maxDepth = 6;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".android") continue;
      if (["node_modules", "build", "Pods", "DerivedData", ".gradle"].includes(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const safeDirectory = resolveWithinAllowed(full);
        if (safeDirectory) walk(safeDirectory, depth + 1);
      } else if (ent.isFile()) {
        const lower = ent.name.toLowerCase();
        if (lower.endsWith(".jks") || lower.endsWith(".keystore")) {
          try {
            const real = resolveWithinAllowed(full);
            if (!real) continue;
            if (seen.has(real)) continue;
            seen.add(real);
            const st = fs.statSync(real);
            results.push({
              path: real,
              storeType: lower.endsWith(".jks") ? "JKS" : "unknown",
              size: st.size,
            });
            // Le fichier reste autorisé via la racine déjà choisie ; un scan
            // n'élargit jamais les autorisations persistantes.
          } catch {}
        }
      }
    }
  }

  for (const root of roots) {
    if (typeof root !== "string") continue;
    const real = resolveWithinAllowed(root);
    if (!real) {
      diagSigning("warn", "scan: dossier non autorisé refusé", { root });
      continue;
    }
    walk(real, 0);
  }
  diagSigning("info", "scan terminé", { rootsCount: roots.length, found: results.length });
  return results;
});

function resolveStoredKeystore(storedPathInput, projectPathInput) {
  const storedPath = typeof storedPathInput === "string" ? storedPathInput.trim() : "";
  const projectPath = resolveWithinAllowed(projectPathInput);
  const result = {
    ok: false,
    storedPath,
    testedPaths: [],
    isAbsolute: false,
    readable: false,
  };
  if (!storedPath || !projectPath) return { ...result, errorCode: "invalid-path" };

  const expanded =
    storedPath === "~"
      ? app.getPath("home")
      : storedPath.startsWith(`~${path.sep}`)
        ? path.join(app.getPath("home"), storedPath.slice(2))
        : storedPath;
  const candidates = path.isAbsolute(expanded)
    ? [path.normalize(expanded)]
    : [
        path.resolve(projectPath, expanded),
        path.resolve(projectPath, "android", expanded),
        path.resolve(projectPath, "android", "app", expanded),
      ];
  result.testedPaths = [...new Set(candidates)];

  const matches = [];
  for (const candidate of result.testedPaths) {
    try {
      const real = fs.realpathSync(candidate);
      const stat = fs.statSync(real);
      const authorized = path.isAbsolute(expanded)
        ? resolveKeystorePath(real)
        : resolveWithinAllowed(real);
      if (authorized && stat.isFile() && !matches.includes(authorized)) matches.push(authorized);
    } catch {}
  }
  if (matches.length > 1) {
    return { ...result, errorCode: "multiple-matches", candidates: matches };
  }
  if (matches.length === 0) return { ...result, errorCode: "not-found" };

  const resolvedPath = matches[0];
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isFile()) return { ...result, resolvedPath, errorCode: "not-a-file" };
    fs.accessSync(resolvedPath, fs.constants.R_OK);
  } catch {
    return { ...result, resolvedPath, errorCode: "not-readable" };
  }
  return {
    ...result,
    ok: true,
    resolvedPath,
    isAbsolute: path.isAbsolute(resolvedPath),
    readable: true,
  };
}

ipcMain.handle("signing:resolveKeystore", (_e, args) => {
  return resolveStoredKeystore(args?.storedPath, args?.projectPath);
});

function resolveJdkTool(name) {
  const home = process.env.JAVA_HOME;
  if (home) {
    const candidate = path.join(home, "bin", process.platform === "win32" ? `${name}.exe` : name);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {}
  }
  return process.platform === "win32" ? `${name}.exe` : name;
}

function runJdkTool(tool, args, timeoutMs = 60_000) {
  return new Promise((resolve) => {
    const child = spawn(resolveJdkTool(tool), args, { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ code: -1, stdout, stderr: `${stderr}\n[timeout]` });
    }, timeoutMs);
    child.stdout?.on("data", (data) => (stdout += data.toString()));
    child.stderr?.on("data", (data) => (stderr += data.toString()));
    child.on("error", (error) =>
      finish({ code: -1, stdout, stderr: `${stderr}\n${String(error)}`, spawnError: error }),
    );
    child.on("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}

async function verifyAabSignature(safe) {
  let stat;
  try {
    stat = fs.statSync(safe);
  } catch {
    return { ok: false, errorCode: "file-missing" };
  }
  if (!stat.isFile()) return { ok: false, errorCode: "file-missing" };
  if (stat.size <= 0)
    return { ok: false, errorCode: "empty-file", errorHint: "Le fichier AAB est vide." };

  const verified = await runJdkTool("jarsigner", ["-verify", "-verbose", "-certs", safe]);
  if (verified.spawnError?.code === "ENOENT") {
    return {
      ok: false,
      errorCode: "jarsigner-missing",
      errorHint: "jarsigner est introuvable. Installez un JDK 17+.",
    };
  }
  const verificationOutput = `${verified.stdout}\n${verified.stderr}`;
  const explicitlyUnsigned = /jar is unsigned|jar n'est pas signé|non signé/i.test(
    verificationOutput,
  );
  if (
    verified.code !== 0 ||
    explicitlyUnsigned ||
    !/jar verified\.|jar vérifié\./i.test(verificationOutput)
  ) {
    return {
      ok: false,
      errorCode: "verification-failed",
      errorHint: "La signature JAR du fichier AAB n'est pas valide.",
    };
  }

  const certificate = await runJdkTool("keytool", ["-printcert", "-jarfile", safe]);
  const output = `${certificate.stdout}\n${certificate.stderr}`;
  const sha256 = output
    .match(/SHA[\s-]?256\s*:\s*([0-9A-Fa-f: ]+)/i)?.[1]
    ?.replace(/\s+/g, "")
    .toUpperCase();
  const owner = output.match(/^\s*(?:Owner|Propriétaire)\s*:\s*(.+)$/im)?.[1]?.trim();
  if (certificate.code !== 0 || !sha256) {
    return {
      ok: false,
      errorCode: "verification-failed",
      errorHint: "Le certificat de signature de l'AAB est illisible.",
    };
  }
  return { ok: true, sha256, certificate: owner };
}

function runProcess(command, args, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      finish({ code: -1, stdout, stderr: `${stderr}\n[timeout]` });
    }, timeoutMs);
    child.stdout?.on("data", (data) => (stdout += data.toString()));
    child.stderr?.on("data", (data) => (stderr += data.toString()));
    child.on("error", (error) =>
      finish({ code: -1, stdout, stderr: `${stderr}\n${String(error)}`, spawnError: error }),
    );
    child.on("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}

async function validateWithBundletool(aabPath) {
  const candidates = [];
  if (process.env.APPPUBLISHER_BUNDLETOOL_JAR) {
    candidates.push(process.env.APPPUBLISHER_BUNDLETOOL_JAR);
  }
  if (process.resourcesPath)
    candidates.push(path.join(process.resourcesPath, "tools", "bundletool.jar"));
  try {
    candidates.push(path.join(app.getAppPath(), "tools", "bundletool.jar"));
  } catch {}

  for (const candidate of [...new Set(candidates)]) {
    try {
      if (!fs.statSync(candidate).isFile()) continue;
    } catch {
      continue;
    }
    const versionResult = await runJdkTool("java", ["-jar", candidate, "version"]);
    const version = `${versionResult.stdout}\n${versionResult.stderr}`.trim().split(/\r?\n/)[0];
    const result = await runJdkTool("java", ["-jar", candidate, "validate", `--bundle=${aabPath}`]);
    return result.code === 0
      ? { status: "passed", version: version || undefined }
      : {
          status: "failed",
          version: version || undefined,
          detail: redactSensitiveText(`${result.stderr}\n${result.stdout}`).trim().slice(-2_000),
        };
  }

  const probe = await runProcess(process.platform === "win32" ? "bundletool.exe" : "bundletool", [
    "version",
  ]);
  if (probe.spawnError?.code === "ENOENT") return { status: "unavailable" };
  if (probe.code !== 0) {
    return {
      status: "unavailable",
      detail: "La commande bundletool est présente, mais ne peut pas être exécutée.",
    };
  }
  const version = `${probe.stdout}\n${probe.stderr}`.trim().split(/\r?\n/)[0];
  const result = await runProcess(process.platform === "win32" ? "bundletool.exe" : "bundletool", [
    "validate",
    `--bundle=${aabPath}`,
  ]);
  return result.code === 0
    ? { status: "passed", version: version || undefined }
    : {
        status: "failed",
        version: version || undefined,
        detail: redactSensitiveText(`${result.stderr}\n${result.stdout}`).trim().slice(-2_000),
      };
}

function safeExpectedAab(value) {
  const cleanString = (candidate, max) =>
    typeof candidate === "string" && candidate.trim().length <= max ? candidate.trim() : undefined;
  const versionCode =
    Number.isSafeInteger(value?.versionCode) && value.versionCode >= 0
      ? value.versionCode
      : undefined;
  return {
    packageName: cleanString(value?.packageName, 255),
    versionName: cleanString(value?.versionName, 255),
    versionCode,
    signerSha256: normalizeFingerprint(cleanString(value?.signerSha256, 128)),
  };
}

function writeAabReport(aabPath, report) {
  const reportPath = `${aabPath}.apppublisher-report.json`;
  const safePath = projectAccess.resolveForCreate(reportPath);
  if (!safePath) throw new Error("Le rapport AAB ne peut pas être écrit hors du projet autorisé.");
  const temporary = `${safePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(
      temporary,
      `${JSON.stringify({ ...report, reportPath: safePath }, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
    fs.renameSync(temporary, safePath);
  } catch (error) {
    try {
      fs.unlinkSync(temporary);
    } catch {}
    throw error;
  }
  return safePath;
}

function persistAabReport(aabPath, report) {
  try {
    report.reportPath = writeAabReport(aabPath, report);
  } catch {
    report.issues.push({
      id: "report-write-failed",
      severity: "warning",
      title: "Rapport non exporté",
      detail: "Le contrôle est terminé, mais sa copie JSON n'a pas pu être écrite à côté de l'AAB.",
    });
    if (report.verdict === "ready") report.verdict = "warnings";
  }
  return report;
}

ipcMain.handle("signing:verifyAab", async (_e, inputPath) => {
  const safe = resolveWithinAllowed(inputPath);
  if (!safe)
    return { ok: false, errorCode: "file-missing", errorHint: "Le fichier AAB est introuvable." };
  return verifyAabSignature(safe);
});

ipcMain.handle("aab:inspect", async (_e, request) => {
  const safe = resolveWithinAllowed(request?.path);
  if (!safe) throw new Error("Le fichier AAB est introuvable ou hors du projet autorisé.");
  const inspectedAt = new Date().toISOString();
  const expected = safeExpectedAab(request?.expected);
  let archive;
  try {
    archive = inspectAabArchive(safe);
  } catch (error) {
    const stat = (() => {
      try {
        return fs.statSync(safe);
      } catch {
        return null;
      }
    })();
    const report = {
      schemaVersion: 1,
      inspectedAt,
      verdict: "blocked",
      artifactSizeBytes: stat?.isFile() ? stat.size : 0,
      signatureValid: false,
      expected,
      bundletool: { status: "unavailable" },
      modules: [],
      issues: [
        {
          id: "aab-unreadable",
          severity: "error",
          title: "AAB illisible",
          detail: error instanceof Error ? error.message : String(error),
        },
      ],
    };
    return request?.persistReport ? persistAabReport(safe, report) : report;
  }
  const [signature, bundletool] = await Promise.all([
    verifyAabSignature(safe),
    validateWithBundletool(safe),
  ]);
  const report = buildValidationReport({ archive, signature, bundletool, expected, inspectedAt });
  return request?.persistReport ? persistAabReport(safe, report) : report;
});

/* ==========================================================================
 *  IPC : Secrets (macOS Keychain)
 *
 *  macOS : utilise `/usr/bin/security` (fourni par le système).
 *  Windows / Linux : renvoie systématiquement `available:false`.
 *  Le service Keychain est fixe : "com.apppublisher.signing".
 * ========================================================================== */

const KEYCHAIN_SERVICE = "com.apppublisher.signing";
const GOOGLE_PLAY_KEYCHAIN_SERVICE = "com.apppublisher.google-play";

function secretsSupported() {
  if (process.platform === "darwin") {
    try {
      fs.accessSync("/usr/bin/security", fs.constants.X_OK);
      return { platform: "darwin", available: true };
    } catch {
      return {
        platform: "darwin",
        available: false,
        reason: "L'outil système /usr/bin/security est introuvable.",
      };
    }
  }
  if (process.platform === "win32") {
    return {
      platform: "win32",
      available: false,
      reason: "Le trousseau Windows n'est pas encore pris en charge par cette version.",
    };
  }
  return {
    platform: "linux",
    available: false,
    reason: "Le trousseau Linux n'est pas encore pris en charge par cette version.",
  };
}

function runSecurity(args, input) {
  return new Promise((resolve) => {
    const child = spawn("/usr/bin/security", args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => resolve({ code: -1, stdout, stderr: String(e) }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    if (input !== undefined) {
      try {
        child.stdin?.end(input);
      } catch {}
    } else {
      try {
        child.stdin?.end();
      } catch {}
    }
  });
}

function accountFor(profileId, field) {
  return `${profileId}:${field}`;
}

function googlePlayAccountFor(connectionId) {
  return `google-play:${connectionId}:credentials`;
}

function legacyGooglePlayAccountFor(connectionId) {
  return `google-play:${connectionId}:service-account`;
}

function validGooglePlayConnectionId(value) {
  return typeof value === "string" && /^gplay_[a-f0-9]{32}$/.test(value);
}

function storedProjectForGooglePlay(
  projectPathInput,
  packageName,
  connectionId,
  requireConnection,
) {
  const projectPath = resolveWithinAllowed(projectPathInput);
  if (!projectPath) return null;
  const stored = durableStore.get("projects");
  if (!stored.ok || !stored.found || !Array.isArray(stored.value)) return null;
  return (
    stored.value.find((project) => {
      const savedPath = resolveWithinAllowed(project?.localPath);
      const android = project?.publishing?.android ?? {};
      const savedPackage = android.applicationId ?? project.packageName ?? project.playStoreAppId;
      return (
        savedPath === projectPath &&
        savedPackage === packageName &&
        (!requireConnection || android.googlePlayConnectionId === connectionId)
      );
    }) ?? null
  );
}

async function setGooglePlayCredentials(connectionId, credentials) {
  if (!validGooglePlayConnectionId(connectionId)) return false;
  const serialized = JSON.stringify(credentials);
  const secret =
    credentials.type === "authorized_user" ? credentials.refresh_token : credentials.private_key;
  if (secret) knownSecretValues.add(secret);
  const line =
    [
      "add-generic-password",
      "-a",
      quoteForSecurityInteractive(googlePlayAccountFor(connectionId)),
      "-s",
      quoteForSecurityInteractive(GOOGLE_PLAY_KEYCHAIN_SERVICE),
      "-w",
      quoteForSecurityInteractive(serialized),
      "-U",
    ].join(" ") + "\n";
  await runSecurity(["-i"], line);
  const stored = await getGooglePlayCredentials(connectionId);
  const storedSecret =
    stored?.type === "authorized_user" ? stored.refresh_token : stored?.private_key;
  return (
    stored?.type === credentials.type &&
    (stored?.account_email ?? stored?.client_email) ===
      (credentials.account_email ?? credentials.client_email) &&
    storedSecret === secret
  );
}

async function getGooglePlayCredentials(connectionId) {
  if (!validGooglePlayConnectionId(connectionId)) return null;
  for (const account of [
    googlePlayAccountFor(connectionId),
    legacyGooglePlayAccountFor(connectionId),
  ]) {
    const result = await runSecurity([
      "find-generic-password",
      "-a",
      account,
      "-s",
      GOOGLE_PLAY_KEYCHAIN_SERVICE,
      "-w",
    ]);
    if (result.code !== 0) continue;
    try {
      const credentials = validateGooglePlayCredentials(JSON.parse(result.stdout));
      const secret =
        credentials.type === "authorized_user"
          ? credentials.refresh_token
          : credentials.private_key;
      if (secret) knownSecretValues.add(secret);
      return credentials;
    } catch {
      // Essaie l'ancien emplacement avant de conclure à une clé absente.
    }
  }
  return null;
}

function publicGooglePlayError(error) {
  if (error instanceof GooglePlayError) {
    return {
      ok: false,
      errorCode: error.code,
      errorHint: error.message,
      status: error.status,
      phase: error.phase,
      causeCode: error.causeCode,
    };
  }
  return {
    ok: false,
    errorCode: "unknown",
    errorHint: "La communication avec Google Play a échoué.",
  };
}

function storedSigningProfile(profileId) {
  const stored = durableStore.get("android-signing.profiles.v1");
  if (!stored.ok || !stored.found || !Array.isArray(stored.value)) return null;
  return stored.value.find((profile) => profile?.id === profileId) ?? null;
}

function linkedStoredProject(projectPathInput, profileId) {
  const projectPath = resolveWithinAllowed(projectPathInput);
  if (!projectPath) return null;
  const stored = durableStore.get("projects");
  if (!stored.ok || !stored.found || !Array.isArray(stored.value)) return null;
  return (
    stored.value.find((project) => {
      const savedPath = resolveWithinAllowed(project?.localPath);
      return (
        savedPath === projectPath && project?.publishing?.android?.signingProfileId === profileId
      );
    }) ?? null
  );
}

async function getStoredSecret(profileId, field) {
  const sup = secretsSupported();
  if (!sup.available) return null;
  const account = accountFor(profileId, field);
  const result = await runSecurity([
    "find-generic-password",
    "-a",
    account,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
  ]);
  if (result.code !== 0) return null;
  const value = result.stdout.replace(/\r?\n$/, "");
  if (value.length >= 4) knownSecretValues.add(value);
  return value;
}

function validateStoredProfileArgs(args, requireProject) {
  if (!args || typeof args !== "object") return null;
  if (typeof args.profileId !== "string" || !/^[a-zA-Z0-9._-]+$/.test(args.profileId)) {
    return null;
  }
  const profile = storedSigningProfile(args.profileId);
  if (!profile || profile.keystorePath !== args.keystorePath || profile.alias !== args.alias) {
    return null;
  }
  if (requireProject && !linkedStoredProject(args.projectPath, profile.id)) return null;
  return profile;
}

async function validateStoredKeystore(profile, projectPath) {
  if (!isValidAlias(profile.alias)) {
    return { ok: false, errorCode: "invalid-keystore", errorHint: "Alias invalide." };
  }
  const resolved = projectPath
    ? resolveStoredKeystore(profile.keystorePath, projectPath)
    : (() => {
        const safe = resolveKeystorePath(profile.keystorePath);
        return safe
          ? {
              ok: true,
              resolvedPath: safe,
              storedPath: profile.keystorePath,
              testedPaths: [profile.keystorePath],
              isAbsolute: path.isAbsolute(safe),
              readable: true,
            }
          : { ok: false, errorCode: "not-found" };
      })();
  if (!resolved.ok || !resolved.resolvedPath) {
    return { ok: false, errorCode: "file-missing", errorHint: "Keystore introuvable." };
  }
  const support = secretsSupported();
  if (!support.available) {
    return { ok: false, errorCode: "keychain-unavailable", errorHint: support.reason };
  }
  const storepass = await getStoredSecret(profile.id, "storepass");
  if (!storepass) {
    return { ok: false, errorCode: "keychain-missing", errorHint: "Mot de passe absent." };
  }
  const commandArgs = [
    "-J-Duser.language=en",
    "-J-Duser.country=US",
    "-list",
    "-v",
    "-keystore",
    resolved.resolvedPath,
    "-storepass:env",
    "APPPUB_STOREPASS",
  ];
  if (profile.alias) commandArgs.push("-alias", profile.alias);
  const result = await runKeytool(commandArgs, { APPPUB_STOREPASS: storepass });
  if (result.spawnError?.code === "ENOENT") {
    return { ok: false, errorCode: "keytool-missing", errorHint: "keytool est introuvable." };
  }
  if (result.code !== 0) {
    return { ok: false, errorCode: classifyKeytoolStderr(result.stderr) };
  }
  return { ok: true, stdout: result.stdout, resolved, storepass };
}

ipcMain.handle("secrets:supported", () => secretsSupported());

/** Échappe une valeur pour le parseur de la commande `security -i`. */
function quoteForSecurityInteractive(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

ipcMain.handle("secrets:set", async (_e, profileId, field, value) => {
  const sup = secretsSupported();
  if (!sup.available) return false;
  if (typeof profileId !== "string" || !/^[a-zA-Z0-9._-]+$/.test(profileId)) return false;
  if (field !== "storepass" && field !== "keypass") return false;
  if (!isValidPassword(value)) return false;
  if (!storedSigningProfile(profileId)) return false;
  knownSecretValues.add(value);
  const account = accountFor(profileId, field);
  // SÉCURITÉ : le mot de passe ne doit JAMAIS apparaître dans l'argv du
  // process enfant (visible via `ps` par tout process local). On utilise le
  // mode interactif de `security` : la commande complète (et donc le secret)
  // est transmise uniquement via stdin. `-U` met à jour l'entrée existante.
  const line =
    [
      "add-generic-password",
      "-a",
      quoteForSecurityInteractive(account),
      "-s",
      quoteForSecurityInteractive(KEYCHAIN_SERVICE),
      "-w",
      quoteForSecurityInteractive(value),
      "-U",
    ].join(" ") + "\n";
  const r = await runSecurity(["-i"], line);
  // `security -i` renvoie 0 même sur erreur de sous-commande : on vérifie
  // que la valeur est bien relisible depuis le trousseau.
  const check = await runSecurity([
    "find-generic-password",
    "-a",
    account,
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
  ]);
  const stored = check.code === 0 ? check.stdout.replace(/\r?\n$/, "") : null;
  if (stored !== value) {
    diagSigning("warn", "secrets:set échec", { profileId, field, code: r.code });
    return false;
  }
  diagSigning("info", "secrets:set", { profileId, field });
  return true;
});

ipcMain.handle("signing:validateStored", async (_e, args) => {
  const profile = validateStoredProfileArgs(args, false);
  if (!profile) return { ok: false, errorCode: "profile-mismatch" };
  const result = await validateStoredKeystore(profile, args.projectPath);
  const { storepass: _secret, resolved: _resolved, ...publicResult } = result;
  return publicResult;
});

ipcMain.handle("signing:prepareBuild", async (event, args) => {
  const profile = validateStoredProfileArgs(args, true);
  if (!profile) return { ok: false, errorCode: "profile-mismatch" };
  const projectPath = resolveWithinAllowed(args.projectPath);
  if (!projectPath) return { ok: false, errorCode: "project-not-authorized" };
  const validated = await validateStoredKeystore(profile, projectPath);
  if (!validated.ok || !validated.resolved?.resolvedPath || !validated.storepass) {
    return {
      ok: false,
      errorCode: validated.errorCode,
      errorHint: validated.errorHint,
    };
  }
  const keypass = (await getStoredSecret(profile.id, "keypass")) ?? validated.storepass;
  const env = {
    ORG_GRADLE_PROJECT_APP_KEYSTORE_FILE: validated.resolved.resolvedPath,
    ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD: validated.storepass,
    ORG_GRADLE_PROJECT_APP_KEY_ALIAS: profile.alias,
    ORG_GRADLE_PROJECT_APP_KEY_PASSWORD: keypass,
  };
  const sessionId = signingSessions.create(event.sender.id, projectPath, env);
  if (!sessionId) return { ok: false, errorCode: "session-failed" };
  return {
    ok: true,
    sessionId,
    keystorePath: validated.resolved.resolvedPath,
    storedPathWasAbsolute:
      validated.resolved.isAbsolute && profile.keystorePath === validated.resolved.resolvedPath,
    testedPaths: validated.resolved.testedPaths,
  };
});

ipcMain.handle("secrets:remove", async (_e, profileId) => {
  const sup = secretsSupported();
  if (!sup.available) return true;
  if (typeof profileId !== "string" || !/^[a-zA-Z0-9._-]+$/.test(profileId)) return false;
  const profile = storedSigningProfile(profileId);
  if (!profile) return false;
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Supprimer l'accès à la signature ?",
    message: `Les mots de passe du profil « ${profile.name} » seront retirés du trousseau.`,
    detail:
      "Le fichier keystore ne sera pas supprimé. Cette action nécessite une réimportation pour signer de nouveau.",
    buttons: ["Supprimer l'accès", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return false;
  for (const field of ["storepass", "keypass"]) {
    const account = accountFor(profileId, field);
    await runSecurity(["delete-generic-password", "-a", account, "-s", KEYCHAIN_SERVICE]);
  }
  diagSigning("info", "secrets:remove", { profileId });
  return true;
});

/* ==========================================================================
 *  IPC : publication Google Play (piste interne uniquement)
 *
 *  Les identifiants restent dans le processus principal et le trousseau.
 *  L'interface ne reçoit que l'adresse publique du compte connecté.
 * ========================================================================== */

ipcMain.handle("google-play:oauthStatus", () => ({ available: googlePlayOAuth.available() }));

ipcMain.handle("google-play:connectOAuth", async (_event, args) => {
  const support = secretsSupported();
  if (!support.available) {
    return { ok: false, errorCode: "keychain-unavailable", errorHint: support.reason };
  }
  if (!args || typeof args !== "object") return { ok: false, errorCode: "invalid-args" };
  const project = storedProjectForGooglePlay(args.projectPath, args.packageName, null, false);
  if (!project) return { ok: false, errorCode: "project-mismatch" };
  try {
    const credentials = await googlePlayOAuth.authorize((url) => shell.openExternal(url));
    const connection = await googlePlayPublisher.prepareConnection(credentials, args.packageName);
    const connectionId = `gplay_${crypto.randomBytes(16).toString("hex")}`;
    if (!(await setGooglePlayCredentials(connectionId, credentials))) {
      return {
        ok: false,
        errorCode: "keychain-write-failed",
        errorHint: "L'autorisation Google n'a pas pu être enregistrée dans le trousseau macOS.",
      };
    }
    diagSigning("info", "google-play:connectOAuth", {
      projectId: project.id,
      packageName: args.packageName,
      connectionId,
      accountEmail: connection.accountEmail,
      authMode: "oauth",
      initializationRequired: connection.initializationRequired,
    });
    return {
      ok: true,
      connectionId,
      accountEmail: connection.accountEmail,
      authMode: "oauth",
      verified: connection.verified,
      initializationRequired: connection.initializationRequired,
    };
  } catch (error) {
    return publicGooglePlayError(error);
  }
});

ipcMain.handle("google-play:importServiceAccount", async (_event, args) => {
  const support = secretsSupported();
  if (!support.available) {
    return { ok: false, errorCode: "keychain-unavailable", errorHint: support.reason };
  }
  if (!args || typeof args !== "object") return { ok: false, errorCode: "invalid-args" };
  const project = storedProjectForGooglePlay(args.projectPath, args.packageName, null, false);
  if (!project) return { ok: false, errorCode: "project-mismatch" };

  const selected = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Importer un compte de service Google Play",
    properties: ["openFile"],
    filters: [{ name: "Clé de compte de service Google", extensions: ["json"] }],
  });
  if (selected.canceled || !selected.filePaths[0]) return { ok: false, errorCode: "cancelled" };

  try {
    const source = selected.filePaths[0];
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size <= 0 || stat.size > 64 * 1024) {
      throw new GooglePlayError(
        "credentials-invalid",
        "Le fichier JSON est vide ou trop volumineux.",
      );
    }
    let parsedCredentials;
    try {
      parsedCredentials = JSON.parse(fs.readFileSync(source, "utf8"));
    } catch {
      throw new GooglePlayError("credentials-invalid", "Le fichier JSON est illisible.");
    }
    const credentials = validateServiceAccountCredentials(parsedCredentials);
    const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "warning",
      title: "Autoriser la publication Google Play ?",
      message: `Associer ${credentials.client_email} à « ${project.name} » ?`,
      detail:
        `Application : ${args.packageName}\n\n` +
        "La clé sera copiée dans le trousseau macOS. Le fichier JSON d'origine ne sera ni modifié ni supprimé.",
      buttons: ["Importer dans le trousseau", "Annuler"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (confirmation.response !== 0) return { ok: false, errorCode: "cancelled" };

    const connectionId = `gplay_${crypto.randomBytes(16).toString("hex")}`;
    const stored = await setGooglePlayCredentials(connectionId, credentials);
    if (!stored) {
      return {
        ok: false,
        errorCode: "keychain-write-failed",
        errorHint: "La clé Google n'a pas pu être enregistrée dans le trousseau macOS.",
      };
    }
    diagSigning("info", "google-play:importServiceAccount", {
      projectId: project.id,
      packageName: args.packageName,
      connectionId,
      serviceAccountEmail: credentials.client_email,
    });
    return {
      ok: true,
      connectionId,
      accountEmail: credentials.client_email,
      authMode: "service-account",
      serviceAccountEmail: credentials.client_email,
      cloudProjectId: credentials.project_id,
    };
  } catch (error) {
    return publicGooglePlayError(error);
  }
});

ipcMain.handle("google-play:testConnection", async (_event, args) => {
  if (!args || typeof args !== "object" || !validGooglePlayConnectionId(args.connectionId)) {
    return { ok: false, errorCode: "invalid-args" };
  }
  const project = storedProjectForGooglePlay(
    args.projectPath,
    args.packageName,
    args.connectionId,
    true,
  );
  if (!project) return { ok: false, errorCode: "project-mismatch" };
  const credentials = await getGooglePlayCredentials(args.connectionId);
  if (!credentials) {
    return {
      ok: false,
      errorCode: "credentials-missing",
      errorHint: "L'autorisation Google Play est absente du trousseau macOS.",
    };
  }
  try {
    const result = await googlePlayPublisher.testConnection(credentials, args.packageName);
    diagSigning("info", "google-play:testConnection", {
      projectId: project.id,
      packageName: args.packageName,
      accountEmail: result.accountEmail,
      authMode: result.authMode,
    });
    return result;
  } catch (error) {
    return publicGooglePlayError(error);
  }
});

ipcMain.handle("google-play:disconnect", async (_event, args) => {
  if (!args || typeof args !== "object" || !validGooglePlayConnectionId(args.connectionId)) {
    return false;
  }
  const project = storedProjectForGooglePlay(
    args.projectPath,
    args.packageName,
    args.connectionId,
    true,
  );
  if (!project) return false;
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Déconnecter Google Play ?",
    message: `Retirer l'accès Google Play de « ${project.name} » ?`,
    detail:
      "L'autorisation sera supprimée du trousseau. Aucun projet ni aucune release Google Play ne sera supprimé.",
    buttons: ["Déconnecter", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return false;
  for (const account of [
    googlePlayAccountFor(args.connectionId),
    legacyGooglePlayAccountFor(args.connectionId),
  ]) {
    await runSecurity([
      "delete-generic-password",
      "-a",
      account,
      "-s",
      GOOGLE_PLAY_KEYCHAIN_SERVICE,
    ]);
  }
  diagSigning("info", "google-play:disconnect", {
    projectId: project.id,
    packageName: args.packageName,
    connectionId: args.connectionId,
  });
  return true;
});

ipcMain.handle("google-play:publishInternal", async (_event, args) => {
  if (!args || typeof args !== "object" || !validGooglePlayConnectionId(args.connectionId)) {
    return { ok: false, errorCode: "invalid-args" };
  }
  const project = storedProjectForGooglePlay(
    args.projectPath,
    args.packageName,
    args.connectionId,
    true,
  );
  if (!project) return { ok: false, errorCode: "project-mismatch" };
  const aabPath = resolveWithinAllowed(args.aabPath);
  if (!aabPath || path.extname(aabPath).toLowerCase() !== ".aab") {
    return { ok: false, errorCode: "aab-invalid", errorHint: "Le fichier AAB n'est pas autorisé." };
  }
  const credentials = await getGooglePlayCredentials(args.connectionId);
  if (!credentials) {
    return {
      ok: false,
      errorCode: "credentials-missing",
      errorHint: "L'autorisation Google Play est absente du trousseau macOS.",
    };
  }
  const signature = await verifyAabSignature(aabPath);
  if (!signature.ok) {
    return {
      ok: false,
      errorCode: "aab-invalid",
      errorHint: signature.errorHint ?? "La signature de l'AAB n'est pas valide.",
    };
  }
  let archive;
  try {
    archive = inspectAabArchive(aabPath);
  } catch {
    return {
      ok: false,
      errorCode: "aab-invalid",
      errorHint: "L'identité Android de l'AAB n'a pas pu être vérifiée.",
    };
  }
  if (
    archive.packageName !== args.packageName ||
    archive.versionName !== project.currentVersion ||
    archive.versionCode !== project.currentBuild
  ) {
    return {
      ok: false,
      errorCode: "aab-identity-mismatch",
      errorHint:
        "Le package, la version ou le versionCode de l'AAB ne correspond pas au projet actif.",
    };
  }
  const confirmation = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "warning",
    title: "Publier sur la piste interne ?",
    message: `Envoyer « ${project.name} » v${project.currentVersion} (build ${project.currentBuild}) à Google Play ?`,
    detail:
      `Application : ${args.packageName}\n` +
      "Piste : internal\n" +
      `Compte : ${credentials.account_email ?? credentials.client_email}\n\n` +
      "Cette action téléverse l'AAB et valide une nouvelle édition Google Play. Elle ne publie pas en production.",
    buttons: ["Publier sur internal", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  if (confirmation.response !== 0) return { ok: false, errorCode: "cancelled" };

  try {
    const result = await googlePlayPublisher.publishInternal(
      {
        credentials,
        packageName: args.packageName,
        aabPath,
        notes: args.notes,
        language: project.publishing?.android?.primaryLanguage ?? "fr-FR",
        releaseName: `${project.name} ${project.currentVersion} (${project.currentBuild})`,
      },
      (phase) =>
        diagSigning("info", "google-play:publishInternal step", {
          projectId: project.id,
          packageName: args.packageName,
          phase,
        }),
    );
    diagSigning("info", "google-play:publishInternal", {
      projectId: project.id,
      packageName: result.packageName,
      track: result.track,
      versionCode: result.versionCode,
      editId: result.editId,
    });
    return result;
  } catch (error) {
    const publicError = publicGooglePlayError(error);
    diagSigning("warn", "google-play:publishInternal failed", {
      projectId: project.id,
      packageName: args.packageName,
      errorCode: publicError.errorCode,
      status: publicError.status,
      phase: publicError.phase,
      causeCode: publicError.causeCode,
    });
    return publicError;
  }
});
