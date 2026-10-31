const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PHASES = new Set(["bundle-uploaded", "commit-unknown"]);

function isString(value, max = 4096) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function normalizeCheckpoint(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!isString(value.projectId, 256)) return null;
  if (!isString(value.connectionId, 256)) return null;
  if (!isString(value.packageName, 255)) return null;
  if (!isString(value.artifactSha256, 128) || !/^[0-9A-Fa-f]{64}$/.test(value.artifactSha256)) {
    return null;
  }
  if (!Number.isSafeInteger(value.versionCode) || value.versionCode < 1) return null;
  if (!isString(value.editId, 512)) return null;
  if (!PHASES.has(value.phase)) return null;
  if (!isString(value.createdAt, 64) || Number.isNaN(Date.parse(value.createdAt))) return null;
  if (!isString(value.updatedAt, 64) || Number.isNaN(Date.parse(value.updatedAt))) return null;
  return {
    projectId: value.projectId,
    connectionId: value.connectionId,
    packageName: value.packageName,
    artifactSha256: value.artifactSha256.toUpperCase(),
    versionCode: value.versionCode,
    editId: value.editId,
    phase: value.phase,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

class GooglePlayResumeStore {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.fs = options.fsModule ?? fs;
    this.now = options.now ?? (() => Date.now());
  }

  readAll() {
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
      if (parsed?.schemaVersion !== SCHEMA_VERSION || !parsed.checkpoints || typeof parsed.checkpoints !== "object") {
        return {};
      }
      const clean = {};
      for (const [projectId, raw] of Object.entries(parsed.checkpoints)) {
        const checkpoint = normalizeCheckpoint(raw);
        if (checkpoint && checkpoint.projectId === projectId) clean[projectId] = checkpoint;
      }
      return clean;
    } catch {
      return {};
    }
  }

  writeAll(checkpoints) {
    const parent = path.dirname(this.filePath);
    const temporary = this.filePath + ".tmp-" + process.pid + "-" + this.now();
    this.fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    const payload = JSON.stringify(
      { schemaVersion: SCHEMA_VERSION, updatedAt: new Date(this.now()).toISOString(), checkpoints },
      null,
      2,
    ) + "\n";
    try {
      this.fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
      this.fs.renameSync(temporary, this.filePath);
    } catch (error) {
      try {
        this.fs.unlinkSync(temporary);
      } catch {}
      throw error;
    }
  }

  get(projectId, binding = {}) {
    const checkpoint = this.readAll()[projectId];
    if (!checkpoint) return null;
    const age = this.now() - Date.parse(checkpoint.updatedAt);
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      this.clear(projectId);
      return null;
    }
    for (const [key, expected] of Object.entries(binding)) {
      if (expected == null) continue;
      const actual =
        key === "artifactSha256"
          ? checkpoint.artifactSha256.toUpperCase()
          : checkpoint[key];
      const normalizedExpected =
        key === "artifactSha256" && typeof expected === "string"
          ? expected.toUpperCase()
          : expected;
      if (actual !== normalizedExpected) {
        this.clear(projectId);
        return null;
      }
    }
    return checkpoint;
  }

  save(projectId, value) {
    const nowIso = new Date(this.now()).toISOString();
    const current = this.readAll()[projectId];
    const checkpoint = normalizeCheckpoint({
      ...value,
      projectId,
      createdAt: current?.createdAt ?? value.createdAt ?? nowIso,
      updatedAt: nowIso,
    });
    if (!checkpoint) throw new Error("Checkpoint Google Play invalide.");
    const all = this.readAll();
    all[projectId] = checkpoint;
    this.writeAll(all);
    return checkpoint;
  }

  clear(projectId) {
    const all = this.readAll();
    if (!all[projectId]) return false;
    delete all[projectId];
    this.writeAll(all);
    return true;
  }

  prune(bindings = []) {
    const byProject = new Map(
      Array.isArray(bindings)
        ? bindings
            .filter((item) => item && typeof item.projectId === "string")
            .map((item) => [item.projectId, item])
        : [],
    );
    const all = this.readAll();
    const kept = {};
    const removed = [];
    for (const [projectId, checkpoint] of Object.entries(all)) {
      const binding = byProject.get(projectId);
      const age = this.now() - Date.parse(checkpoint.updatedAt);
      const expired = !Number.isFinite(age) || age < 0 || age > MAX_AGE_MS;
      const mismatch =
        !binding ||
        (binding.connectionId && checkpoint.connectionId !== binding.connectionId) ||
        (binding.packageName && checkpoint.packageName !== binding.packageName);
      if (expired || mismatch) {
        removed.push(projectId);
        continue;
      }
      kept[projectId] = checkpoint;
    }
    if (removed.length) this.writeAll(kept);
    return { removed, kept: Object.keys(kept) };
  }
}

module.exports = {
  GooglePlayResumeStore,
  MAX_AGE_MS,
  normalizeCheckpoint,
};
