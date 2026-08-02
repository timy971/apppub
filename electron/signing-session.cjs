const crypto = require("crypto");

const SESSION_PATTERN = /^sign_[a-f0-9]{32}$/;

class SigningSessionRegistry {
  constructor(options = {}) {
    this.now = options.now ?? Date.now;
    this.randomBytes = options.randomBytes ?? crypto.randomBytes;
    this.ttlMs = options.ttlMs ?? 2 * 60_000;
    this.sessions = new Map();
  }

  prune() {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }

  create(senderId, projectPath, env) {
    if (!Number.isInteger(senderId) || !projectPath || !env || typeof env !== "object") {
      return null;
    }
    this.prune();
    const id = `sign_${this.randomBytes(16).toString("hex")}`;
    this.sessions.set(id, {
      senderId,
      projectPath,
      env: { ...env },
      expiresAt: this.now() + this.ttlMs,
    });
    return id;
  }

  consume(senderId, id, projectPath) {
    if (!SESSION_PATTERN.test(id)) return null;
    this.prune();
    const session = this.sessions.get(id);
    if (!session || session.senderId !== senderId || session.projectPath !== projectPath) {
      return null;
    }
    this.sessions.delete(id);
    return { ...session.env };
  }

  clearSender(senderId) {
    let count = 0;
    for (const [id, session] of this.sessions) {
      if (session.senderId !== senderId) continue;
      this.sessions.delete(id);
      count += 1;
    }
    return count;
  }

  clear() {
    const count = this.sessions.size;
    this.sessions.clear();
    return count;
  }
}

module.exports = { SESSION_PATTERN, SigningSessionRegistry };
