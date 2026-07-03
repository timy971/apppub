/* eslint-disable */
/**
 * AppPublisher — Electron main process.
 * Fenêtre unique, sandbox actif, aucune API Node exposée au renderer.
 * Toute la communication passe par le preload et le canal IPC typé.
 */
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const https = require("https");

const isDev = !!process.env.APPPUBLISHER_DEV_URL;

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
      const p = spawn(cmd, args, { shell: process.platform === "win32" });
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
    runCapture(process.execPath === process.argv[0] ? "node" : "node", ["-v"]),
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

ipcMain.handle("projects:detect", (_e, projectPath) => detectProjectFiles(projectPath));

ipcMain.handle("projects:scan", (_e, rootPath) => {
  try {
    const dirs = fs
      .readdirSync(rootPath, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."));
    const results = [];
    for (const d of dirs) {
      const p = path.join(rootPath, d.name);
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
  return r.filePaths[0];
});

/* ---------- IPC : Exec (streaming) ---------- */

ipcMain.handle("exec:run", (event, opts, channel) => {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let aborted = false;
    const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
    try {
      const child = spawn(opts.cmd, opts.args || [], {
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env || {}) },
        shell: process.platform === "win32",
      });
      const timer = setTimeout(() => {
        aborted = true;
        child.kill();
      }, timeoutMs);

      const push = (stream, data) => {
        const text = data.toString();
        if (stream === "stdout") stdout += text;
        else stderr += text;
        if (channel) {
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

/* ---------- IPC : FS ---------- */

ipcMain.handle("fs:exists", (_e, p) => fs.existsSync(p));

ipcMain.handle("fs:readJson", (_e, p) => {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
});

ipcMain.handle("fs:readText", (_e, p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
});

ipcMain.handle("fs:stat", (_e, p) => {
  try {
    const s = fs.statSync(p);
    return { size: s.size, isFile: s.isFile(), isDir: s.isDirectory() };
  } catch {
    return null;
  }
});

ipcMain.handle("fs:listDir", (_e, p) => {
  try {
    return fs.readdirSync(p);
  } catch {
    return [];
  }
});

ipcMain.handle("fs:findByExtension", (_e, dir, ext, maxDepth = 6) => {
  const results = [];
  function walk(d, depth) {
    if (depth > maxDepth) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.isFile() && e.name.endsWith(ext)) results.push(p);
    }
  }
  walk(dir, 0);
  return results;
});

/* ---------- IPC : Shell ---------- */

ipcMain.handle("shell:openFolder", (_e, p) => shell.openPath(p));
ipcMain.handle("shell:revealItem", (_e, p) => shell.showItemInFolder(p));

/* ---------- IPC : Net ---------- */

ipcMain.handle("net:online", pingInternet);
