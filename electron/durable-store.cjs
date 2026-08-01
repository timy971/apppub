const fs = require("fs");
const path = require("path");

const STORE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_KEYS = new Set([
  "android-signing.profiles.v1",
  "backups",
  "history",
  "journal",
  "projects",
  "settings",
]);

function emptyDocument() {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    values: {},
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(value, depth = 0, seen = new WeakSet()) {
  if (depth > 30) return false;
  if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
    return typeof value !== "number" || Number.isFinite(value);
  }
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.every((item) => validateJsonValue(item, depth + 1, seen));
  }
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(
    ([key, child]) =>
      key.length <= 256 &&
      !["__proto__", "constructor", "prototype"].includes(key) &&
      validateJsonValue(child, depth + 1, seen),
  );
}

function hasString(value, key) {
  return isPlainObject(value) && typeof value[key] === "string" && value[key].length > 0;
}

function validArray(value, max, validator) {
  return Array.isArray(value) && value.length <= max && value.every(validator);
}

function validateStoredValue(key, value) {
  if (!validateJsonValue(value)) return false;
  if (key === "settings") {
    if (!isPlainObject(value)) return false;
    const allowed = new Set([
      "activeProjectId",
      "autoBackupEnabled",
      "contextualHelpEnabled",
      "language",
      "mode",
      "onboardingCompleted",
      "projectsRootPath",
      "theme",
      "userName",
    ]);
    if (Object.keys(value).some((field) => !allowed.has(field))) return false;
    if (value.theme != null && !["light", "dark", "system"].includes(value.theme)) return false;
    if (value.mode != null && !["discovery", "assistant", "expert"].includes(value.mode))
      return false;
    if (value.language != null && !["fr", "en"].includes(value.language)) return false;
    for (const field of ["userName", "projectsRootPath", "activeProjectId"]) {
      if (value[field] != null && typeof value[field] !== "string") return false;
    }
    for (const field of ["onboardingCompleted", "contextualHelpEnabled", "autoBackupEnabled"]) {
      if (value[field] != null && typeof value[field] !== "boolean") return false;
    }
    return true;
  }
  if (key === "projects") {
    return validArray(
      value,
      1000,
      (project) =>
        hasString(project, "id") &&
        hasString(project, "name") &&
        hasString(project, "localPath") &&
        hasString(project, "currentVersion") &&
        Number.isSafeInteger(project.currentBuild) &&
        project.currentBuild > 0 &&
        isPlainObject(project.detected) &&
        ["hasPackageJson", "hasAndroid", "hasIos", "hasVersionJson", "hasCapacitorConfig"].every(
          (field) =>
            project.detected[field] == null || typeof project.detected[field] === "boolean",
        ),
    );
  }
  if (key === "history") {
    return validArray(
      value,
      200,
      (entry) =>
        hasString(entry, "id") &&
        hasString(entry, "projectId") &&
        hasString(entry, "projectName") &&
        hasString(entry, "version") &&
        hasString(entry, "createdAt") &&
        Number.isSafeInteger(entry.build),
    );
  }
  if (key === "journal") {
    return validArray(
      value,
      500,
      (entry) =>
        hasString(entry, "id") &&
        hasString(entry, "message") &&
        hasString(entry, "createdAt") &&
        ["info", "warn", "error", "command"].includes(entry.level),
    );
  }
  if (key === "backups") {
    return validArray(
      value,
      20,
      (backup) =>
        hasString(backup, "id") &&
        hasString(backup, "projectId") &&
        hasString(backup, "createdAt") &&
        ["version", "build", "publish", "manual"].includes(backup.reason) &&
        validArray(
          backup.files,
          10,
          (file) =>
            hasString(file, "path") &&
            [
              "version.json",
              "package.json",
              "CHANGELOG.md",
              "android/app/build.gradle",
              "android/app/build.gradle.kts",
            ].includes(file.path) &&
            Number.isSafeInteger(file.size) &&
            file.size >= 0,
        ),
    );
  }
  if (key === "android-signing.profiles.v1") {
    return validArray(value, 100, (profile) => {
      if (
        !hasString(profile, "id") ||
        !hasString(profile, "name") ||
        !hasString(profile, "keystorePath") ||
        !hasString(profile, "alias")
      ) {
        return false;
      }
      const allowed = new Set([
        "id",
        "name",
        "keystorePath",
        "alias",
        "storeType",
        "certificate",
        "secureStorage",
        "createdAt",
        "lastValidatedAt",
        "lastUsedAt",
      ]);
      return !Object.keys(profile).some(
        (field) =>
          !allowed.has(field) ||
          /pass(?:word)?|secret|token|private[_-]?key|api[_-]?key/i.test(field),
      );
    });
  }
  return false;
}

function validateDocument(value) {
  if (!isPlainObject(value)) return false;
  if (value.schemaVersion !== STORE_SCHEMA_VERSION) return false;
  if (typeof value.updatedAt !== "string" || Number.isNaN(Date.parse(value.updatedAt)))
    return false;
  if (!isPlainObject(value.values)) return false;
  return Object.entries(value.values).every(
    ([key, child]) => ALLOWED_KEYS.has(key) && validateStoredValue(key, child),
  );
}

class DurableStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.backupPath = `${filePath}.bak`;
    this.fs = options.fsModule ?? fs;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.lastError = null;
    this.document = this.load();
  }

  parseFile(filePath) {
    const stat = this.fs.statSync(filePath);
    if (!stat.isFile() || stat.size > this.maxBytes)
      throw new Error("Fichier de données invalide.");
    const parsed = JSON.parse(this.fs.readFileSync(filePath, "utf8"));
    if (!validateDocument(parsed)) throw new Error("Schéma de données invalide.");
    return parsed;
  }

  load() {
    try {
      const document = this.parseFile(this.filePath);
      this.lastError = null;
      return document;
    } catch (primaryError) {
      try {
        const recovered = this.parseFile(this.backupPath);
        this.lastError = `Données principales récupérées depuis la sauvegarde : ${String(primaryError)}`;
        return recovered;
      } catch {
        if (this.fs.existsSync(this.filePath)) {
          this.lastError = `Données locales illisibles : ${String(primaryError)}`;
        }
        return emptyDocument();
      }
    }
  }

  writeFileAtomic(target, content) {
    const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      this.fs.writeFileSync(temporary, content, { encoding: "utf8", mode: 0o600 });
      this.fs.renameSync(temporary, target);
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }

  backupCurrentOrSeed(serialized) {
    if (!this.fs.existsSync(this.filePath)) {
      if (!this.fs.existsSync(this.backupPath)) {
        this.writeFileAtomic(this.backupPath, serialized);
      }
      return;
    }

    let currentIsValid = false;
    try {
      this.parseFile(this.filePath);
      currentIsValid = true;
    } catch {
      // Le fichier de secours existant reste intact si le principal est corrompu.
    }
    if (currentIsValid) {
      this.writeFileAtomic(this.backupPath, this.fs.readFileSync(this.filePath, "utf8"));
    }
  }

  write(next) {
    if (!validateDocument(next)) throw new Error("Tentative d'enregistrer des données invalides.");
    const serialized = `${JSON.stringify(next, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > this.maxBytes) {
      throw new Error("Le stockage AppPublisher a dépassé sa taille maximale.");
    }
    const parent = path.dirname(this.filePath);
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    this.fs.mkdirSync(parent, { recursive: true });
    try {
      // Une mise à jour n'écrase jamais un état valide tant que sa copie de
      // secours atomique n'a pas elle-même réussi.
      this.backupCurrentOrSeed(serialized);
      this.fs.writeFileSync(temporary, serialized, { encoding: "utf8", mode: 0o600 });
      this.fs.renameSync(temporary, this.filePath);
      this.document = next;
      this.lastError = null;
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {}
      this.lastError = String(error);
      throw error;
    }
  }

  get(key) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: "Clé de stockage interdite." };
    if (!Object.prototype.hasOwnProperty.call(this.document.values, key)) {
      return { ok: true, found: false };
    }
    return { ok: true, found: true, value: structuredClone(this.document.values[key]) };
  }

  set(key, value) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: "Clé de stockage interdite." };
    if (!validateStoredValue(key, value)) {
      return { ok: false, error: "Valeur de stockage invalide pour cette clé." };
    }
    try {
      const next = {
        schemaVersion: STORE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        values: { ...this.document.values, [key]: structuredClone(value) },
      };
      this.write(next);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  remove(key) {
    if (!ALLOWED_KEYS.has(key)) return { ok: false, error: "Clé de stockage interdite." };
    try {
      const values = { ...this.document.values };
      delete values[key];
      this.write({
        schemaVersion: STORE_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        values,
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  snapshot() {
    return structuredClone(this.document);
  }

  replace(document) {
    if (!validateDocument(document)) {
      return { ok: false, error: "Le fichier importé n'est pas un export AppPublisher valide." };
    }
    try {
      this.write(structuredClone(document));
      return { ok: true, keys: Object.keys(document.values).sort() };
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) };
    }
  }

  status() {
    return {
      ok: !this.lastError,
      schemaVersion: STORE_SCHEMA_VERSION,
      filePath: this.filePath,
      lastError: this.lastError,
    };
  }
}

module.exports = {
  ALLOWED_KEYS,
  DEFAULT_MAX_BYTES,
  DurableStore,
  STORE_SCHEMA_VERSION,
  emptyDocument,
  validateDocument,
  validateJsonValue,
  validateStoredValue,
};
