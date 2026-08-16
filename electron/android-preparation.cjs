const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CAPACITOR_CONFIG_FILES = Object.freeze([
  "capacitor.config.json",
  "capacitor.config.ts",
  "capacitor.config.js",
]);

const PACKAGE_MANAGERS = Object.freeze([
  { file: "package-lock.json", name: "npm" },
  { file: "pnpm-lock.yaml", name: "pnpm" },
  { file: "yarn.lock", name: "yarn" },
  { file: "bun.lock", name: "bun" },
  { file: "bun.lockb", name: "bun" },
]);

const APPLICATION_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const CERTIFIED_CAPACITOR_VERSION = "7.6.8";
const ROLLBACK_CANDIDATES = Object.freeze([
  "android",
  "node_modules",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ...CAPACITOR_CONFIG_FILES,
]);

function readTextSafe(filePath, fsModule = fs) {
  try {
    return fsModule.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function readJsonSafe(filePath, fsModule = fs) {
  const raw = readTextSafe(filePath, fsModule);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function literalField(raw, field) {
  if (typeof raw !== "string") return undefined;
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = raw.match(new RegExp(`${escaped}\\s*:\\s*['\"\`]([^'\"\`]+)['\"\`]`));
  return match?.[1]?.trim() || undefined;
}

function parseCapacitorConfig(projectPath, fsModule = fs) {
  for (const relative of CAPACITOR_CONFIG_FILES) {
    const absolute = path.join(projectPath, relative);
    if (!fsModule.existsSync(absolute)) continue;
    const raw = readTextSafe(absolute, fsModule);
    if (raw == null) {
      return { file: relative, readable: false };
    }
    if (relative.endsWith(".json")) {
      const parsed = readJsonSafe(absolute, fsModule);
      return {
        file: relative,
        readable: !!parsed && typeof parsed === "object",
        appId: typeof parsed?.appId === "string" ? parsed.appId.trim() : undefined,
        appName: typeof parsed?.appName === "string" ? parsed.appName.trim() : undefined,
        webDir: typeof parsed?.webDir === "string" ? parsed.webDir.trim() : undefined,
      };
    }
    return {
      file: relative,
      readable: true,
      appId: literalField(raw, "appId"),
      appName: literalField(raw, "appName"),
      webDir: literalField(raw, "webDir"),
    };
  }
  return null;
}

function packageManager(projectPath, pkg, fsModule = fs) {
  const declared =
    typeof pkg?.packageManager === "string"
      ? pkg.packageManager.split("@")[0].trim().toLowerCase()
      : "";
  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  for (const candidate of PACKAGE_MANAGERS) {
    if (!fsModule.existsSync(path.join(projectPath, candidate.file))) continue;
    // Les exports Lovable contiennent souvent un lock Bun sans imposer Bun.
    // npm sait installer ces projets et est déjà une dépendance d'AppPublisher.
    return candidate.name === "bun" ? "npm" : candidate.name;
  }
  return "npm";
}

function slug(value) {
  const normalized = String(value || "application")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 40);
  return normalized || "application";
}

function inferWebDir(buildScript, capacitorConfig) {
  if (capacitorConfig?.webDir) return capacitorConfig.webDir;
  const script = String(buildScript || "");
  if (/react-scripts\s+build/i.test(script)) return "build";
  if (/next\s+build/i.test(script)) return "out";
  return "dist";
}

function safeWebDir(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!trimmed || trimmed === "." || path.posix.isAbsolute(trimmed)) return null;
  const normalized = path.posix.normalize(trimmed);
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized === "android" ||
    normalized.startsWith("android/") ||
    normalized === "ios" ||
    normalized.startsWith("ios/")
  ) {
    return null;
  }
  return normalized;
}

function inspectAndroidPreparation(projectPath, fsModule = fs) {
  const packageFile = path.join(projectPath, "package.json");
  const pkg = readJsonSafe(packageFile, fsModule);
  const hasPackageJson = !!pkg && typeof pkg === "object";
  const buildScript =
    hasPackageJson && typeof pkg.scripts?.build === "string" ? pkg.scripts.build.trim() : undefined;
  const config = parseCapacitorConfig(projectPath, fsModule);
  const manager = packageManager(projectPath, pkg, fsModule);
  const proposedName =
    config?.appName ||
    (typeof pkg?.displayName === "string" && pkg.displayName.trim()) ||
    (typeof pkg?.name === "string" && pkg.name.trim()) ||
    path.basename(projectPath);
  const proposedId = config?.appId || `app.${slug(pkg?.name || proposedName)}.android`;
  const inferredWebDir = inferWebDir(buildScript, config);
  const webDir = safeWebDir(inferredWebDir) || "dist";
  const androidDir = path.join(projectPath, "android");
  const hasAndroid = fsModule.existsSync(androidDir);
  const hasGradleWrapper =
    fsModule.existsSync(path.join(androidDir, "gradlew")) ||
    fsModule.existsSync(path.join(androidDir, "gradlew.bat"));
  const hasAndroidBuildFile =
    fsModule.existsSync(path.join(androidDir, "app", "build.gradle")) ||
    fsModule.existsSync(path.join(androidDir, "app", "build.gradle.kts"));
  const dependencies = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const hasCapacitorCore = typeof dependencies["@capacitor/core"] === "string";
  const hasCapacitorCli = typeof dependencies["@capacitor/cli"] === "string";
  const hasCapacitorAndroid = typeof dependencies["@capacitor/android"] === "string";
  const blockers = [];
  const warnings = [];

  if (!hasPackageJson) blockers.push("package.json est absent ou illisible.");
  if (hasPackageJson && !buildScript)
    blockers.push("Aucun script « build » n’est défini dans package.json.");
  if (
    /next\s+build/i.test(buildScript || "") &&
    !/next\s+export|output\s*:\s*['\"]export/i.test(buildScript || "")
  ) {
    blockers.push(
      "Ce projet Next.js semble dépendre d’un serveur. Capacitor exige un export web entièrement statique.",
    );
  }
  if (config && !config.readable) blockers.push(`${config.file} est illisible.`);
  if (config && !config.appId) blockers.push(`${config.file} ne contient pas d’appId littéral.`);
  if (config?.appId && !APPLICATION_ID.test(config.appId)) {
    blockers.push(`L’appId « ${config.appId} » n’est pas un identifiant Android valide.`);
  }
  if (config && !config.appName)
    blockers.push(`${config.file} ne contient pas d’appName littéral.`);
  if (config && !safeWebDir(config.webDir)) {
    blockers.push(`${config.file} ne contient pas de webDir relatif valide.`);
  }
  if (hasAndroid && !config) {
    blockers.push(
      "Le dossier android/ existe sans configuration Capacitor. AppPublisher refuse de supposer comment le synchroniser.",
    );
  }
  if (hasAndroid && (!hasCapacitorCore || !hasCapacitorCli || !hasCapacitorAndroid)) {
    blockers.push(
      "Le dossier android/ existe, mais package.json ne déclare pas tous les composants Capacitor nécessaires.",
    );
  }
  if (
    fsModule.existsSync(path.join(projectPath, ".env.example")) &&
    !fsModule.existsSync(path.join(projectPath, ".env")) &&
    !fsModule.existsSync(path.join(projectPath, ".env.local"))
  ) {
    warnings.push(
      ".env.example est présent, mais aucun fichier .env ou .env.local n’a été trouvé. Le build peut demander des variables locales.",
    );
  }
  if (hasAndroid && (!hasGradleWrapper || !hasAndroidBuildFile)) {
    blockers.push(
      "Le dossier android/ existe mais il est incomplet. AppPublisher refuse de l’écraser.",
    );
  }

  const status =
    hasAndroid && hasGradleWrapper && hasAndroidBuildFile && blockers.length === 0
      ? "ready"
      : blockers.length
        ? "blocked"
        : "preparable";

  const changes = [];
  if (status === "preparable") {
    changes.push(`Installer les dépendances avec ${manager}`);
    if (!hasCapacitorCore || !hasCapacitorCli || !hasCapacitorAndroid) {
      changes.push(`Ajouter Capacitor ${CERTIFIED_CAPACITOR_VERSION} (version certifiée)`);
    }
    if (!config) changes.push("Créer capacitor.config.json");
    changes.push(`Exécuter le build web vers ${webDir}/`);
    changes.push("Créer puis synchroniser le dossier android/");
    changes.push("Compiler une version Android de contrôle");
  }

  return {
    status,
    blockers,
    warnings,
    changes,
    packageManager: manager,
    buildScript,
    capacitorConfigFile: config?.file,
    hasCapacitorConfig: !!config,
    hasCapacitorCore,
    hasCapacitorCli,
    hasCapacitorAndroid,
    hasAndroid,
    hasGradleWrapper,
    appName: proposedName,
    applicationId: proposedId,
    webDir,
    webOutputReady: fsModule.existsSync(path.join(projectPath, webDir, "index.html")),
  };
}

function validatePreparationInput(input) {
  if (!input || typeof input !== "object") throw new Error("Paramètres de préparation invalides.");
  const appName = typeof input.appName === "string" ? input.appName.trim() : "";
  const applicationId = typeof input.applicationId === "string" ? input.applicationId.trim() : "";
  const webDir = safeWebDir(input.webDir);
  if (!appName || appName.length > 80 || /[\n\r\u0000]/.test(appName)) {
    throw new Error("Le nom de l’application est invalide.");
  }
  if (!APPLICATION_ID.test(applicationId)) {
    throw new Error("L’identifiant Android est invalide.");
  }
  if (!webDir) throw new Error("Le dossier de sortie web est invalide.");
  return { appName, applicationId, webDir };
}

class AndroidPreparationManager {
  constructor(accessRegistry, options = {}) {
    this.access = accessRegistry;
    this.fs = options.fsModule ?? fs;
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
    this.rollbackGuards = new Map();
  }

  resolveProject(projectPath) {
    const project = this.access.resolveExisting(projectPath);
    if (!project) throw new Error("Projet non autorisé.");
    const packageFile = this.access.resolveExisting(path.join(project, "package.json"));
    if (!packageFile || !this.fs.statSync(packageFile).isFile()) {
      throw new Error("Le dossier autorisé n’est pas un projet web valide.");
    }
    return project;
  }

  inspect(projectPath) {
    return inspectAndroidPreparation(this.resolveProject(projectPath), this.fs);
  }

  beginRollbackGuard(projectPath, input) {
    const project = this.resolveProject(projectPath);
    const validated = validatePreparationInput(input);
    const webDir = safeWebDir(validated.webDir);
    const candidates = [...ROLLBACK_CANDIDATES, webDir].filter(
      (value, index, values) => values.indexOf(value) === index,
    );
    const existed = Object.fromEntries(
      candidates.map((relative) => [relative, this.fs.existsSync(path.join(project, relative))]),
    );
    const token = this.randomBytes(24).toString("hex");
    this.rollbackGuards.set(token, { project, existed });
    return { token };
  }

  rollbackCreatedArtifacts(projectPath, token) {
    const project = this.resolveProject(projectPath);
    const guard = this.rollbackGuards.get(token);
    if (!guard || guard.project !== project) {
      throw new Error("Garde de restauration Android invalide ou expirée.");
    }
    this.rollbackGuards.delete(token);
    const removed = [];
    for (const [relative, existedBefore] of Object.entries(guard.existed)) {
      if (existedBefore) continue;
      const target = this.access.resolveExisting(path.join(project, relative));
      if (!target) continue;
      this.fs.rmSync(target, { recursive: true, force: true });
      removed.push(relative);
    }
    return { removed };
  }

  completeRollbackGuard(projectPath, token) {
    const project = this.resolveProject(projectPath);
    const guard = this.rollbackGuards.get(token);
    if (!guard || guard.project !== project) {
      throw new Error("Garde de restauration Android invalide ou expirée.");
    }
    const created = Object.entries(guard.existed)
      .filter(
        ([relative, existedBefore]) =>
          !existedBefore && this.fs.existsSync(path.join(project, relative)),
      )
      .map(([relative]) => relative);
    this.rollbackGuards.delete(token);
    return { completed: true, created };
  }

  createConfig(projectPath, input) {
    const project = this.resolveProject(projectPath);
    const existing = CAPACITOR_CONFIG_FILES.find((file) =>
      this.fs.existsSync(path.join(project, file)),
    );
    if (existing) {
      return { created: false, path: path.join(project, existing), reason: "already-exists" };
    }
    const validated = validatePreparationInput(input);
    const target = this.access.resolveForCreate(path.join(project, "capacitor.config.json"));
    if (!target) throw new Error("Destination de configuration non autorisée.");
    const temporary = `${target}.apppublisher-${process.pid}`;
    const content = `${JSON.stringify(
      {
        appId: validated.applicationId,
        appName: validated.appName,
        webDir: validated.webDir,
      },
      null,
      2,
    )}\n`;
    try {
      this.fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      this.fs.renameSync(temporary, target);
      const verified = readJsonSafe(target, this.fs);
      if (
        verified?.appId !== validated.applicationId ||
        verified?.appName !== validated.appName ||
        verified?.webDir !== validated.webDir
      ) {
        throw new Error("La configuration Capacitor créée n’a pas pu être vérifiée.");
      }
      return { created: true, path: target };
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }
}

module.exports = {
  APPLICATION_ID,
  AndroidPreparationManager,
  CAPACITOR_CONFIG_FILES,
  CERTIFIED_CAPACITOR_VERSION,
  inferWebDir,
  inspectAndroidPreparation,
  parseCapacitorConfig,
  safeWebDir,
  validatePreparationInput,
};
