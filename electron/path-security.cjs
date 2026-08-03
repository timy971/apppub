const fs = require("fs");
const os = require("os");
const path = require("path");

const POSIX_FORBIDDEN_ROOTS = new Set([
  "/",
  "/Applications",
  "/Library",
  "/System",
  "/Users",
  "/Volumes",
  "/bin",
  "/etc",
  "/home",
  "/opt",
  "/private",
  "/sbin",
  "/usr",
  "/var",
  "/tmp",
]);

function samePath(left, right, platform = process.platform) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isDangerouslyBroadRoot(root, options = {}) {
  if (!root || typeof root !== "string") return true;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const resolved = path.resolve(root);
  if (samePath(resolved, path.parse(resolved).root, platform)) return true;
  if (homeDir && samePath(resolved, homeDir, platform)) return true;

  if (platform === "win32") {
    const driveUsers = path.join(path.parse(resolved).root, "Users");
    return samePath(resolved, driveUsers, platform);
  }

  return POSIX_FORBIDDEN_ROOTS.has(resolved);
}

function writeJsonAtomic(filePath, value, fsModule = fs) {
  const parent = path.dirname(filePath);
  fsModule.mkdirSync(parent, { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fsModule.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    fsModule.renameSync(temporary, filePath);
  } catch (error) {
    try {
      fsModule.unlinkSync(temporary);
    } catch {}
    throw error;
  }
}

class ProjectAccessRegistry {
  constructor(options = {}) {
    this.fs = options.fsModule ?? fs;
    this.filePath = options.filePath;
    this.platform = options.platform ?? process.platform;
    this.homeDir = options.homeDir ?? os.homedir();
    this.roots = new Set();
  }

  load() {
    if (!this.filePath) return [];
    let parsed;
    try {
      parsed = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return [];
    }
    if (
      parsed?.schemaVersion !== 1 ||
      parsed?.approvalMethod !== "native-dialog" ||
      !Array.isArray(parsed.roots)
    ) {
      return [];
    }
    const roots = parsed.roots;
    for (const candidate of roots) this.approveExisting(candidate, { persist: false });
    return [...this.roots];
  }

  persist() {
    if (!this.filePath) return;
    writeJsonAtomic(
      this.filePath,
      {
        schemaVersion: 1,
        approvalMethod: "native-dialog",
        roots: [...this.roots].sort(),
      },
      this.fs,
    );
  }

  approveExisting(candidate, options = {}) {
    if (!candidate || typeof candidate !== "string") return null;
    try {
      const real = this.fs.realpathSync(candidate);
      if (!this.fs.statSync(real).isDirectory()) return null;
      if (isDangerouslyBroadRoot(real, { platform: this.platform, homeDir: this.homeDir })) {
        return null;
      }
      const wasNew = !this.roots.has(real);
      this.roots.add(real);
      if (wasNew && options.persist !== false) this.persist();
      return real;
    } catch {
      return null;
    }
  }

  revoke(candidate) {
    let changed = false;
    for (const root of this.roots) {
      if (samePath(root, candidate, this.platform)) {
        this.roots.delete(root);
        changed = true;
      }
    }
    if (changed) this.persist();
    return changed;
  }

  resolveExisting(inputPath) {
    if (!inputPath || typeof inputPath !== "string" || this.roots.size === 0) return null;
    try {
      const real = this.fs.realpathSync(inputPath);
      return [...this.roots].some((root) => isWithin(root, real)) ? real : null;
    } catch {
      return null;
    }
  }

  /**
   * Résout une destination qui n'existe pas encore sans perdre le confinement.
   * Le premier ancêtre existant est canonicalisé, puis tous les segments à
   * créer sont reconstruits sous cet ancêtre approuvé.
   */
  resolveForCreate(inputPath) {
    if (!inputPath || typeof inputPath !== "string" || this.roots.size === 0) return null;
    const absolute = path.resolve(inputPath);
    let existing = absolute;
    while (!this.fs.existsSync(existing)) {
      const parent = path.dirname(existing);
      if (parent === existing) return null;
      existing = parent;
    }
    try {
      const realExisting = this.fs.realpathSync(existing);
      if (![...this.roots].some((root) => isWithin(root, realExisting))) return null;
      const relative = path.relative(existing, absolute);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
      return path.resolve(realExisting, relative);
    } catch {
      return null;
    }
  }

  list() {
    return [...this.roots];
  }
}

class FileAccessRegistry {
  constructor(options = {}) {
    this.fs = options.fsModule ?? fs;
    this.filePath = options.filePath;
    this.platform = options.platform ?? process.platform;
    this.files = new Set();
  }

  load() {
    if (!this.filePath) return [];
    let parsed;
    try {
      parsed = JSON.parse(this.fs.readFileSync(this.filePath, "utf8"));
    } catch {
      return [];
    }
    if (
      parsed?.schemaVersion !== 1 ||
      parsed?.approvalMethod !== "native-dialog" ||
      !Array.isArray(parsed.files)
    ) {
      return [];
    }
    for (const candidate of parsed.files) this.approveExisting(candidate, { persist: false });
    return [...this.files];
  }

  persist() {
    if (!this.filePath) return;
    writeJsonAtomic(
      this.filePath,
      {
        schemaVersion: 1,
        approvalMethod: "native-dialog",
        files: [...this.files].sort(),
      },
      this.fs,
    );
  }

  approveExisting(candidate, options = {}) {
    if (!candidate || typeof candidate !== "string") return null;
    try {
      const real = this.fs.realpathSync(candidate);
      if (!this.fs.statSync(real).isFile()) return null;
      const wasNew = !this.files.has(real);
      this.files.add(real);
      if (wasNew && options.persist !== false) this.persist();
      return real;
    } catch {
      return null;
    }
  }

  resolveExisting(candidate) {
    if (!candidate || typeof candidate !== "string") return null;
    try {
      const real = this.fs.realpathSync(candidate);
      return [...this.files].some((approved) => samePath(approved, real, this.platform))
        ? real
        : null;
    } catch {
      return null;
    }
  }

  revoke(candidate) {
    let changed = false;
    for (const approved of this.files) {
      if (!samePath(approved, candidate, this.platform)) continue;
      this.files.delete(approved);
      changed = true;
    }
    if (changed) this.persist();
    return changed;
  }
}

module.exports = {
  FileAccessRegistry,
  POSIX_FORBIDDEN_ROOTS,
  ProjectAccessRegistry,
  isDangerouslyBroadRoot,
  isWithin,
  isWithin,
  samePath,
  writeJsonAtomic,
};
