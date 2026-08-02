const fs = require("fs");
const path = require("path");
const { writeJsonAtomic } = require("./path-security.cjs");

class ProjectTrustStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.fs = options.fsModule ?? fs;
    this.trusted = new Set();
  }

  load(accessRegistry) {
    let parsed;
    try {
      parsed = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return [];
    }
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.projects)) return [];
    for (const candidate of parsed.projects) {
      const safe = accessRegistry.resolveExisting(candidate);
      if (safe) this.trusted.add(safe);
    }
    return [...this.trusted];
  }

  persist() {
    writeJsonAtomic(
      this.filePath,
      { schemaVersion: 1, projects: [...this.trusted].sort() },
      this.fs,
    );
  }

  isTrusted(projectPath) {
    return this.trusted.has(projectPath);
  }

  trust(projectPath) {
    if (!projectPath || typeof projectPath !== "string") return false;
    const wasNew = !this.trusted.has(projectPath);
    this.trusted.add(projectPath);
    if (wasNew) this.persist();
    return true;
  }

  revoke(projectPath) {
    const removed = this.trusted.delete(projectPath);
    if (removed) this.persist();
    return removed;
  }
}

async function ensureProjectTrusted(projectPath, trustStore, confirmTrust) {
  if (trustStore.isTrusted(projectPath)) return true;
  if (typeof confirmTrust !== "function") return false;
  const approved = await confirmTrust({
    projectPath,
    projectName: path.basename(projectPath),
  });
  if (!approved) return false;
  return trustStore.trust(projectPath);
}

module.exports = { ProjectTrustStore, ensureProjectTrusted };
