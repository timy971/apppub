/** Stockage local chiffré par Windows DPAPI via Electron safeStorage. */
const fs = require("node:fs");
const path = require("node:path");

class WindowsSecretStore {
  constructor(options) {
    this.file = options.file;
    this.safeStorage = options.safeStorage;
  }

  isAvailable() {
    try {
      return this.safeStorage.isEncryptionAvailable() === true;
    } catch {
      return false;
    }
  }

  key(service, account) {
    return Buffer.from(`${service}\0${account}`, "utf8").toString("base64url");
  }

  readDocument() {
    try {
      const source = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (source?.version !== 1 || !source.entries || typeof source.entries !== "object") {
        return { version: 1, entries: {} };
      }
      return source;
    } catch {
      return { version: 1, entries: {} };
    }
  }

  writeDocument(document) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(document)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
  }

  set(service, account, value) {
    if (!this.isAvailable() || typeof value !== "string") return false;
    const document = this.readDocument();
    document.entries[this.key(service, account)] = this.safeStorage
      .encryptString(value)
      .toString("base64");
    this.writeDocument(document);
    return this.get(service, account) === value;
  }

  get(service, account) {
    if (!this.isAvailable()) return null;
    const encrypted = this.readDocument().entries[this.key(service, account)];
    if (typeof encrypted !== "string") return null;
    try {
      return this.safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return null;
    }
  }

  delete(service, account) {
    if (!this.isAvailable()) return false;
    const document = this.readDocument();
    delete document.entries[this.key(service, account)];
    this.writeDocument(document);
    return true;
  }
}

module.exports = { WindowsSecretStore };
