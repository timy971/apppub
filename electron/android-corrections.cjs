const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const APPLICATION_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const VERSION_NAME = /^[0-9A-Za-z][0-9A-Za-z._+-]{0,79}$/;
const EDITABLE_FILES = Object.freeze([
  "capacitor.config.json",
  "capacitor.config.ts",
  "capacitor.config.js",
  "android/app/build.gradle",
  "android/app/build.gradle.kts",
  "android/variables.gradle",
  "version.json",
]);

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function validateDesired(input) {
  if (!input || typeof input !== "object") throw new Error("Correction Android invalide.");
  const desired = {};
  if (input.packageName != null) {
    const value = String(input.packageName).trim();
    if (!APPLICATION_ID.test(value)) throw new Error("Package Android invalide.");
    desired.packageName = value;
  }
  if (input.versionName != null) {
    const value = String(input.versionName).trim();
    if (!VERSION_NAME.test(value)) throw new Error("Version Android invalide.");
    desired.versionName = value;
  }
  if (input.versionCode != null) {
    const value = Number(input.versionCode);
    if (!Number.isSafeInteger(value) || value < 1 || value > 2_100_000_000) {
      throw new Error("versionCode Android invalide.");
    }
    desired.versionCode = value;
  }
  if (input.targetSdk != null) {
    const value = Number(input.targetSdk);
    if (!Number.isSafeInteger(value) || value < 21 || value > 99) {
      throw new Error("targetSdk Android invalide.");
    }
    desired.targetSdk = value;
  }
  if (Object.keys(desired).length === 0) throw new Error("Aucune correction demandée.");
  return desired;
}

function replaceUnique(raw, expression, replacement, label) {
  const matches = [
    ...raw.matchAll(
      new RegExp(
        expression.source,
        expression.flags.includes("g") ? expression.flags : `${expression.flags}g`,
      ),
    ),
  ];
  if (matches.length === 0) return { status: "missing" };
  if (matches.length > 1)
    return { status: "ambiguous", reason: `${label} apparaît plusieurs fois.` };
  const match = matches[0];
  const next =
    raw.slice(0, match.index) +
    match[0].replace(expression, replacement) +
    raw.slice(match.index + match[0].length);
  return {
    status: next === raw ? "unchanged" : "changed",
    content: next,
    before: match[0],
    after: match[0].replace(expression, replacement),
  };
}

function replaceCapacitorAppId(relative, raw, value) {
  if (relative.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { status: "blocked", reason: `${relative} n'est pas un JSON valide.` };
    }
    if (!parsed || typeof parsed !== "object" || typeof parsed.appId !== "string") {
      return { status: "blocked", reason: `${relative} ne contient pas d'appId modifiable.` };
    }
    const before = parsed.appId;
    if (before === value) return { status: "unchanged" };
    parsed.appId = value;
    return {
      status: "changed",
      content: `${JSON.stringify(parsed, null, 2)}\n`,
      before,
      after: value,
    };
  }
  const result = replaceUnique(raw, /(appId\s*:\s*)(['"`])([^'"`]+)\2/, `$1$2${value}$2`, "appId");
  return result.status === "missing" || result.status === "ambiguous"
    ? {
        status: "blocked",
        reason: result.reason ?? `${relative} ne contient pas d'appId littéral.`,
      }
    : result;
}

function replaceGradleValue(raw, kind, value) {
  const patterns = {
    packageName: /(\bapplicationId\s*(?:=\s*)?)(['"])([^'"]+)\2/,
    versionName: /(\bversionName\s*(?:=\s*)?)(['"])([^'"]+)\2/,
    versionCode: /(\bversionCode\s*(?:=\s*)?)(\d+)/,
    targetSdk: /(\btargetSdk(?:Version)?\s*(?:=\s*)?)(\d+)/,
  };
  const replacement =
    kind === "packageName" || kind === "versionName" ? `$1$2${value}$2` : `$1${value}`;
  return replaceUnique(raw, patterns[kind], replacement, kind);
}

function fileIfPresent(project, relative, fsModule) {
  const absolute = path.join(project, relative);
  if (!fsModule.existsSync(absolute)) return null;
  const stat = fsModule.statSync(absolute);
  if (!stat.isFile()) return null;
  return { relative, absolute, raw: fsModule.readFileSync(absolute, "utf8") };
}

function planToken(project, desired, files) {
  return sha256(
    JSON.stringify({
      project,
      desired,
      files: files.map((file) => [file.relative, sha256(file.raw)]),
    }),
  );
}

class AndroidCorrectionManager {
  constructor(accessRegistry, options = {}) {
    this.access = accessRegistry;
    this.fs = options.fsModule ?? fs;
  }

  resolveProject(projectPath) {
    const project = this.access.resolveExisting(projectPath);
    if (!project) throw new Error("Projet non autorisé.");
    const packageFile = this.access.resolveExisting(path.join(project, "package.json"));
    if (!packageFile || !this.fs.statSync(packageFile).isFile()) {
      throw new Error("Le dossier autorisé n'est pas un projet AppPublisher valide.");
    }
    return project;
  }

  preview(projectPath, desiredInput) {
    const project = this.resolveProject(projectPath);
    const desired = validateDesired(desiredInput);
    const files = EDITABLE_FILES.map((relative) =>
      fileIfPresent(project, relative, this.fs),
    ).filter(Boolean);
    const actions = [];
    const blocked = [];
    const drafts = new Map(files.map((file) => [file.relative, file.raw]));

    const update = (relative, kind, title, sensitive, transform) => {
      const current = drafts.get(relative);
      if (current == null) return false;
      const result = transform(current);
      if (result.status === "changed") {
        drafts.set(relative, result.content);
        actions.push({
          id: `${kind}:${relative}`,
          kind,
          title,
          file: relative,
          before: result.before,
          after: result.after,
          sensitive,
        });
        return true;
      }
      if (result.status === "blocked" || result.status === "ambiguous") {
        blocked.push(result.reason ?? `${title} ne peut pas être appliqué automatiquement.`);
      }
      return result.status === "unchanged";
    };

    if (desired.packageName) {
      const capacitor = files.find((file) => /^capacitor\.config\./.test(file.relative));
      if (!capacitor) blocked.push("Aucune configuration Capacitor modifiable n'a été trouvée.");
      else
        update(capacitor.relative, "package", "Harmoniser l'appId Capacitor", true, (raw) =>
          replaceCapacitorAppId(capacitor.relative, raw, desired.packageName),
        );
      const gradle = files.find((file) => /^android\/app\/build\.gradle/.test(file.relative));
      if (!gradle) blocked.push("Le fichier Gradle de l'application est introuvable.");
      else {
        const result = replaceGradleValue(
          drafts.get(gradle.relative),
          "packageName",
          desired.packageName,
        );
        if (result.status === "missing" || result.status === "ambiguous")
          blocked.push(result.reason ?? "applicationId n'est pas un littéral unique dans Gradle.");
        else if (result.status === "changed") {
          drafts.set(gradle.relative, result.content);
          actions.push({
            id: `package:${gradle.relative}`,
            kind: "package",
            title: "Harmoniser l'applicationId Gradle",
            file: gradle.relative,
            before: result.before,
            after: result.after,
            sensitive: true,
          });
        }
      }
    }

    const gradle = files.find((file) => /^android\/app\/build\.gradle/.test(file.relative));
    for (const kind of ["versionName", "versionCode"]) {
      if (desired[kind] == null) continue;
      if (!gradle) {
        blocked.push(`Impossible de corriger ${kind} : fichier Gradle absent.`);
        continue;
      }
      const result = replaceGradleValue(drafts.get(gradle.relative), kind, desired[kind]);
      if (result.status === "missing" || result.status === "ambiguous")
        blocked.push(result.reason ?? `${kind} n'est pas un littéral unique dans Gradle.`);
      else if (result.status === "changed") {
        drafts.set(gradle.relative, result.content);
        actions.push({
          id: `version:${gradle.relative}:${kind}`,
          kind: "version",
          title: `Aligner ${kind}`,
          file: gradle.relative,
          before: result.before,
          after: result.after,
          sensitive: false,
        });
      }
    }

    if (desired.targetSdk != null) {
      let fixed = false;
      for (const relative of [
        "android/app/build.gradle",
        "android/app/build.gradle.kts",
        "android/variables.gradle",
      ]) {
        if (!drafts.has(relative)) continue;
        const result = replaceGradleValue(drafts.get(relative), "targetSdk", desired.targetSdk);
        if (result.status === "ambiguous") {
          blocked.push(result.reason);
          fixed = true;
          break;
        }
        if (result.status === "changed") {
          drafts.set(relative, result.content);
          actions.push({
            id: `sdk:${relative}`,
            kind: "sdk",
            title: "Corriger le SDK cible",
            file: relative,
            before: result.before,
            after: result.after,
            sensitive: false,
          });
          fixed = true;
          break;
        }
        if (result.status === "unchanged") {
          fixed = true;
          break;
        }
      }
      if (!fixed)
        blocked.push("targetSdk n'est pas défini par une valeur littérale sûre à modifier.");
    }

    const changedFiles = [...drafts.entries()]
      .filter(
        ([relative, content]) => content !== files.find((file) => file.relative === relative)?.raw,
      )
      .map(([relative, content]) => ({ relative, content }));
    return {
      token: planToken(project, desired, files),
      desired,
      actions,
      blocked,
      changedFiles: changedFiles.map(({ relative }) => relative),
      canApply: actions.length > 0 && blocked.length === 0,
      sensitive: actions.some((action) => action.sensitive),
      _drafts: changedFiles,
    };
  }

  apply(projectPath, desiredInput, token) {
    const project = this.resolveProject(projectPath);
    const plan = this.preview(project, desiredInput);
    if (typeof token !== "string" || token !== plan.token) {
      throw new Error("Le projet a changé depuis la prévisualisation. Relancez l'analyse.");
    }
    if (!plan.canApply) throw new Error(plan.blocked[0] ?? "Aucune correction sûre à appliquer.");
    const originals = [];
    const temporaries = [];
    try {
      for (const draft of plan._drafts) {
        const target = this.access.resolveExisting(path.join(project, draft.relative));
        if (!target) throw new Error(`Fichier non autorisé : ${draft.relative}.`);
        const original = this.fs.readFileSync(target, "utf8");
        originals.push({ target, original });
        const temporary = `${target}.apppublisher-correction-${process.pid}`;
        temporaries.push(temporary);
        this.fs.writeFileSync(temporary, draft.content, { encoding: "utf8", mode: 0o600 });
        this.fs.renameSync(temporary, target);
        if (this.fs.readFileSync(target, "utf8") !== draft.content)
          throw new Error(`La correction de ${draft.relative} n'a pas pu être vérifiée.`);
      }
    } catch (error) {
      for (const item of originals.reverse()) {
        try {
          this.fs.writeFileSync(item.target, item.original, "utf8");
        } catch {}
      }
      throw error;
    } finally {
      for (const temporary of temporaries) {
        try {
          this.fs.unlinkSync(temporary);
        } catch {}
      }
    }
    return { applied: true, actions: plan.actions, changedFiles: plan.changedFiles };
  }
}

function publicPlan(plan) {
  const { _drafts, ...safe } = plan;
  return safe;
}

module.exports = {
  AndroidCorrectionManager,
  EDITABLE_FILES,
  publicPlan,
  replaceGradleValue,
  validateDesired,
};
