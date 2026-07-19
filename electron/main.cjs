/* eslint-disable */
/**
 * AppPublisher — Electron main process (Phase 3).
 *
 * Sécurité (rappel Phase 2)
 *  - `exec:run` : allowlist stricte de commandes, arguments validés,
 *    `shell:false`, env du renderer ignoré, cwd confiné aux racines projet.
 *  - `fs:*` et `shell:*` : chemins canonicalisés + containment obligatoire.
 *
 * Nouveautés Phase 3
 *  - `bootstrapPath()` : au démarrage, on importe le PATH d'un login shell
 *    utilisateur (zsh/bash) pour retrouver Homebrew, nvm, JDK, sdkmanager,
 *    exactement comme si l'utilisateur ouvrait un Terminal. Sans ça, une
 *    application lancée depuis le Finder ne trouve ni `node`, ni `npm`,
 *    ni `java`, ni `git`.
 *  - `projects:registerRoots` : ré-enregistre en une fois les racines des
 *    projets déjà connus (persistés côté renderer), sinon toute lecture
 *    disque est refusée au 2ᵉ lancement.
 *  - Écritures disque confinées : `fs:writeText`, `fs:writeJson`,
 *    `fs:mkdir`, `fs:copyFile` — indispensables pour de vraies sauvegardes.
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const os = require("os");
const https = require("https");

const isDev = !!process.env.APPPUBLISHER_DEV_URL;

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
    return JSON.stringify(v, (_k, val) =>
      typeof val === "string" && val.length > 500 ? val.slice(0, 500) + "…" : val,
    );
  } catch {
    return String(v);
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
ipcMain.handle = (channel, fn) => {
  _origHandle(channel, async (event, ...args) => {
    const opId = diagStart(`ipc:${channel}`, { args });
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
ipcMain.on("diag:log", (_e, entry) => {
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
    parts.push(`Mémoire libre/total (Mo): ${Math.round(os.freemem() / 1048576)}/${Math.round(os.totalmem() / 1048576)}`);
    parts.push(`Répertoire de logs: ${DIAG_LOG_DIR}`);
    if (extra && typeof extra === "object") {
      parts.push("");
      parts.push("## Contexte renderer");
      try {
        parts.push(JSON.stringify(extra, null, 2));
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
        parts.push(fs.readFileSync(path.join(DIAG_LOG_DIR, f), "utf8"));
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

const allowedRoots = new Set();

/**
 * Audit I2 — les racines connues sont persistées sur disque et rechargées
 * synchronement dès `app.whenReady()`, AVANT la création de la fenêtre.
 * Cela supprime la course entre `registerRoots()` côté renderer (asynchrone,
 * appelé dans un useEffect) et les premiers `fs:*` du Dashboard qui se
 * voyaient sinon refuser l'accès (allowedRoots vide) → « dossier android
 * manquant » intempestif au 1er rendu.
 */
function knownRootsPath() {
  return path.join(app.getPath("userData"), "known-roots.json");
}

function loadKnownRoots() {
  try {
    const raw = fs.readFileSync(knownRootsPath(), "utf8");
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => typeof p === "string");
  } catch {
    return [];
  }
}

function persistKnownRoots() {
  try {
    fs.mkdirSync(path.dirname(knownRootsPath()), { recursive: true });
    fs.writeFileSync(
      knownRootsPath(),
      JSON.stringify([...allowedRoots], null, 2),
      "utf8",
    );
  } catch (e) {
    diagWrite({ level: "warn", message: "known-roots persist failed", ctx: { error: String(e) } });
  }
}

function registerAllowedRoot(p) {
  try {
    if (!p || typeof p !== "string") return null;
    const real = fs.realpathSync(p);
    const st = fs.statSync(real);
    if (!st.isDirectory()) return null;
    const wasNew = !allowedRoots.has(real);
    allowedRoots.add(real);
    if (wasNew) persistKnownRoots();
    return real;
  } catch {
    return null;
  }
}

function resolveWithinAllowed(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return null;
  if (allowedRoots.size === 0) return null;
  let candidate;
  try {
    candidate = fs.realpathSync(inputPath);
  } catch {
    try {
      const parent = fs.realpathSync(path.dirname(inputPath));
      candidate = path.join(parent, path.basename(inputPath));
    } catch {
      return null;
    }
  }
  for (const root of allowedRoots) {
    const rel = path.relative(root, candidate);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
      return candidate;
    }
  }
  return null;
}

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
          {
            label: "Outils de développement",
            accelerator: "CmdOrCtrl+Alt+I",
            click: () => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.openDevTools({ mode: "detach" });
              }
            },
          },
        ],
      },
    );
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
    diagWrite({ level: "info", message: "Diagnostic menu installé" });
  } catch (e) {
    diagWrite({ level: "error", message: "setupDiagnosticMenu failed", error: String(e) });
  }
}


/* ---------- Sécurité : allowlist commandes ---------- */

const COMMAND_ALLOWLIST = new Set([
  "node",
  "npm",
  "npm.cmd",
  "npx",
  "npx.cmd",
  "git",
  "java",
  "gradlew",
  "gradlew.bat",
  "./gradlew",
]);

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

function isSafeArg(a) {
  if (typeof a !== "string") return false;
  if (a.length > 4096) return false;
  return !ARG_FORBIDDEN.test(a);
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

function isAllowedCommand(cmd) {
  if (typeof cmd !== "string") return false;
  const base = path.basename(cmd);
  return COMMAND_ALLOWLIST.has(base) || COMMAND_ALLOWLIST.has(cmd);
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

let mainWindow = null;

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

  if (isDev) win.loadURL(process.env.APPPUBLISHER_DEV_URL);
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

  mainWindow = win;
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

app.whenReady().then(() => {
  diagWrite({ level: "info", message: "app whenReady" });

  // Audit I2 — restaurer les racines projet connues AVANT tout accès fs
  //           depuis le renderer, pour éviter la course au 1er rendu.
  safeStep("restore-known-roots", () => {
    const persisted = loadKnownRoots();
    let restored = 0;
    for (const p of persisted) {
      if (registerAllowedRoot(p)) restored += 1;
    }
    diagWrite({
      level: "info",
      message: "known-roots restored",
      ctx: { count: restored, requested: persisted.length },
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
    if (BrowserWindow.getAllWindows().length === 0) safeStep("createWindow(activate)", createWindow);
  });
}).catch((e) => {
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

  const androidHome =
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || guessAndroidSdk();
  const androidStudio = guessAndroidStudio();
  const internet = await pingInternet();

  return {
    platform: process.platform,
    node: node.ok ? node.out.replace(/^v/, "") : undefined,
    npm: npm.ok ? npm.out : undefined,
    git: git.ok ? (git.out.match(/\d+\.\d+\.\d+/)?.[0] ?? git.out) : undefined,
    java:
      java.ok || java.err
        ? (java.err || java.out).split("\n")[0].match(/"([^"]+)"/)?.[1] ?? "installé"
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

  const displayName =
    capacitorAppName || androidAppName || pkgDisplayName || pkgName || undefined;

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
      registerAllowedRoot(p);
      const detected = detectProjectFiles(p);
      if (detected.hasPackageJson) {
        results.push({ path: p, name: detected.displayName || detected.packageName || d.name, detected });
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
  const real = registerAllowedRoot(r.filePaths[0]);
  return real ?? r.filePaths[0];
});

/**
 * Ré-enregistre en une passe les racines des projets connus côté renderer.
 * Appelé au montage de l'application. Sans cette étape, aucun accès disque
 * n'est autorisé au 2ᵉ lancement sur les projets déjà mémorisés.
 */
ipcMain.handle("projects:registerRoots", (_e, paths) => {
  if (!Array.isArray(paths)) return [];
  const ok = [];
  for (const p of paths) {
    const real = registerAllowedRoot(p);
    if (real) ok.push(real);
  }
  return ok;
});

/* ---------- IPC : Exec (streaming) ---------- */

ipcMain.handle("exec:run", (event, opts, channel) => {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let aborted = false;
    const timeoutMs = Math.min(Number(opts?.timeoutMs) || 10 * 60 * 1000, 30 * 60 * 1000);

    const fail = (msg) =>
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: msg,
        durationMs: Date.now() - start,
        aborted: false,
      });

    if (!opts || typeof opts !== "object") return fail("Requête invalide.");
    if (!isAllowedCommand(opts.cmd)) return fail(`Commande non autorisée : ${String(opts.cmd)}`);
    const args = Array.isArray(opts.args) ? opts.args : [];
    const unsafe = findUnsafeArg(args);
    if (unsafe) return fail(`Argument invalide #${unsafe.index + 1} : ${unsafe.reason}.`);
    const cwd = resolveWithinAllowed(opts.cwd);
    if (!cwd) return fail("Dossier de travail non autorisé.");

    try {
      const child = spawn(opts.cmd, args, {
        cwd,
        env: process.env, // renderer env ignoré volontairement
        shell: false,
      });
      const timer = setTimeout(() => {
        aborted = true;
        child.kill();
      }, timeoutMs);

      const push = (stream, data) => {
        const text = data.toString();
        if (stream === "stdout") stdout += text;
        else stderr += text;
        if (channel && typeof channel === "string") {
          for (const line of text.split(/\r?\n/)) {
            if (line.length) event.sender.send(channel, { stream, line });
          }
        }
      };

      child.stdout?.on("data", (d) => push("stdout", d));
      child.stderr?.on("data", (d) => push("stderr", d));
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({
          exitCode: -1,
          stdout,
          stderr: stderr + "\n" + String(e),
          durationMs: Date.now() - start,
          aborted,
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          exitCode: code ?? 0,
          stdout,
          stderr,
          durationMs: Date.now() - start,
          aborted,
        });
      });
    } catch (e) {
      resolve({
        exitCode: -1,
        stdout: "",
        stderr: String(e),
        durationMs: Date.now() - start,
        aborted: false,
      });
    }
  });
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

/* ---------- IPC : FS (écriture confinée, Phase 3) ---------- */

ipcMain.handle("fs:mkdir", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return false;
  try {
    fs.mkdirSync(safe, { recursive: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:writeText", (_e, p, content) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return false;
  if (typeof content !== "string") return false;
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, content, "utf8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:writeJson", (_e, p, value) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return false;
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    fs.writeFileSync(safe, JSON.stringify(value, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:copyFile", (_e, src, dest) => {
  const safeSrc = resolveWithinAllowed(src);
  const safeDest = resolveWithinAllowed(dest);
  if (!safeSrc || !safeDest) return false;
  try {
    fs.mkdirSync(path.dirname(safeDest), { recursive: true });
    fs.copyFileSync(safeSrc, safeDest);
    return true;
  } catch {
    return false;
  }
});

/* ---------- IPC : Shell ---------- */

// openFolder accepte un dossier OU un fichier : dans ce dernier cas on ouvre
// le dossier parent. Le renderer peut ainsi passer directement le chemin
// du .aab produit par le build.
ipcMain.handle("shell:openFolder", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return "";
  try {
    const st = fs.statSync(safe);
    const target = st.isDirectory() ? safe : path.dirname(safe);
    return shell.openPath(target);
  } catch {
    return "";
  }
});

ipcMain.handle("shell:revealItem", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return;
  shell.showItemInFolder(safe);
});

/* ---------- IPC : Net ---------- */

ipcMain.handle("net:online", pingInternet);
