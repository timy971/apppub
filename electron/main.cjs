/* eslint-disable */
/**
 * AppPublisher — Electron main process.
 * Fenêtre unique, sandbox actif, aucune API Node exposée au renderer.
 * Toute la communication passe par le preload et le canal IPC typé.
 *
 * Durcissement sécurité :
 *  - `exec:run` restreint à une allowlist de commandes (node, npm, npx, git,
 *    java, gradlew) avec validation stricte des arguments et refus des
 *    variables d'environnement fournies par le renderer.
 *  - Tous les accès `fs:*` et `shell:*` sont confinés à un ensemble de
 *    racines projet explicitement approuvées par l'utilisateur via le
 *    sélecteur natif (`projects:chooseFolder`) ou implicitement par un
 *    scan (`projects:scan`). Les chemins sont canonicalisés avant toute
 *    opération et rejetés s'ils sortent de ces racines.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const https = require("https");

const isDev = !!process.env.APPPUBLISHER_DEV_URL;

/* ---------- Sécurité : racines projet approuvées ---------- */

/** Ensemble des chemins réels autorisés à la lecture / listing / ouverture. */
const allowedRoots = new Set();

function registerAllowedRoot(p) {
  try {
    if (!p || typeof p !== "string") return null;
    const real = fs.realpathSync(p);
    const st = fs.statSync(real);
    if (!st.isDirectory()) return null;
    allowedRoots.add(real);
    return real;
  } catch {
    return null;
  }
}

/**
 * Vérifie qu'un chemin fourni par le renderer est bien contenu dans l'une
 * des racines approuvées. Renvoie le chemin canonicalisé si valide, sinon
 * `null`. Le fichier n'a pas besoin d'exister : on canonicalise alors le
 * parent.
 */
function resolveWithinAllowed(inputPath) {
  if (!inputPath || typeof inputPath !== "string") return null;
  if (allowedRoots.size === 0) return null;

  let candidate;
  try {
    candidate = fs.realpathSync(inputPath);
  } catch {
    // Fichier inexistant : on canonicalise le parent et on recompose.
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

// Métacaractères shell susceptibles d'introduire une injection.
const ARG_FORBIDDEN = /[;&|`$><\n\r\\]/;

function isSafeArg(a) {
  if (typeof a !== "string") return false;
  if (a.length > 2048) return false;
  return !ARG_FORBIDDEN.test(a);
}

function isAllowedCommand(cmd) {
  if (typeof cmd !== "string") return false;
  const base = path.basename(cmd);
  return COMMAND_ALLOWLIST.has(base) || COMMAND_ALLOWLIST.has(cmd);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
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

  win.once("ready-to-show", () => win.show());

  if (isDev) {
    win.loadURL(process.env.APPPUBLISHER_DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
  return win;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
      // Commandes de détection : gérées uniquement en interne, jamais depuis
      // le renderer. `shell:false` pour éviter toute interprétation.
      const p = spawn(cmd, args, { shell: false });
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
  const platform = process.platform;
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
    platform,
    node: node.ok ? node.out.replace(/^v/, "") : undefined,
    npm: npm.ok ? npm.out : undefined,
    git: git.ok ? (git.out.match(/\d+\.\d+\.\d+/)?.[0] ?? git.out) : undefined,
    java: java.ok || java.err
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
    const p = "/Applications/Android Studio.app";
    return fs.existsSync(p) ? "installé" : undefined;
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
  const hasCapCfg =
    exists("capacitor.config.ts") ||
    exists("capacitor.config.js") ||
    exists("capacitor.config.json");
  let pkgName;
  let versionJson;
  try {
    if (exists("package.json")) {
      pkgName = JSON.parse(fs.readFileSync(path.join(projectPath, "package.json"), "utf8")).name;
    }
    if (exists("version.json")) {
      versionJson = JSON.parse(fs.readFileSync(path.join(projectPath, "version.json"), "utf8"));
    }
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
    packageName: pkgName,
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
      // Chaque projet détecté devient une racine autorisée.
      registerAllowedRoot(p);
      const detected = detectProjectFiles(p);
      if (detected.hasPackageJson) {
        results.push({ path: p, name: detected.packageName || d.name, detected });
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
    if (!isAllowedCommand(opts.cmd)) {
      return fail(`Commande non autorisée : ${String(opts.cmd)}`);
    }
    const args = Array.isArray(opts.args) ? opts.args : [];
    if (!args.every(isSafeArg)) {
      return fail("Argument invalide (caractères interdits).");
    }
    const cwd = resolveWithinAllowed(opts.cwd);
    if (!cwd) {
      return fail("Dossier de travail non autorisé.");
    }
    // On ignore complètement `opts.env` : le renderer ne peut pas
    // injecter d'environnement. On expose uniquement l'environnement
    // du processus principal.

    try {
      const child = spawn(opts.cmd, args, {
        cwd,
        env: process.env,
        // `shell:false` : plus d'interprétation shell donc plus
        // d'injection via `&&`, `|`, backticks, etc.
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

/* ---------- IPC : FS (confiné aux racines approuvées) ---------- */

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
      // On reste dans la racine (pas de suivi de lien symbolique sortant).
      if (!resolveWithinAllowed(p)) continue;
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(ext)) results.push(p);
    }
  }
  walk(safe, 0);
  return results;
});

/* ---------- IPC : Shell (dossiers uniquement, dans les racines) ---------- */

ipcMain.handle("shell:openFolder", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return "";
  try {
    const st = fs.statSync(safe);
    if (!st.isDirectory()) return "";
  } catch {
    return "";
  }
  return shell.openPath(safe);
});

ipcMain.handle("shell:revealItem", (_e, p) => {
  const safe = resolveWithinAllowed(p);
  if (!safe) return;
  shell.showItemInFolder(safe);
});

/* ---------- IPC : Net ---------- */

ipcMain.handle("net:online", pingInternet);
