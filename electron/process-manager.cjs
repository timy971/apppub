/* eslint-disable */

const { spawn } = require("child_process");

const EXECUTION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function isValidExecutionId(value) {
  return typeof value === "string" && EXECUTION_ID_PATTERN.test(value);
}

function normalizeSpawnCommand(command, platform = process.platform) {
  if (platform !== "win32") return command;
  if (command === "npm") return "npm.cmd";
  if (command === "npx") return "npx.cmd";
  if (command === "pnpm") return "pnpm.cmd";
  if (command === "yarn") return "yarn.cmd";
  if (command === "bun") return "bun.exe";
  if (command === "gradle") return "gradle.bat";
  return command;
}

/**
 * Termine le processus et, lorsque la plateforme le permet, tout son groupe.
 * Les builds Gradle et les commandes npm créent souvent plusieurs enfants :
 * tuer uniquement le premier PID ne suffit donc pas.
 */
function terminateProcessTree(child, options = {}) {
  if (!child || !Number.isInteger(child.pid) || child.pid <= 0) return false;

  const platform = options.platform ?? process.platform;
  const spawnProcess = options.spawnProcess ?? spawn;
  const killProcess = options.killProcess ?? process.kill.bind(process);
  const setTimer = options.setTimer ?? setTimeout;
  let requested = false;

  if (platform === "win32") {
    try {
      const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore",
      });
      killer?.unref?.();
      requested = true;
    } catch {}

    try {
      requested = child.kill() || requested;
    } catch {}
    return requested;
  }

  try {
    // Les commandes exec:run sont lancées dans un groupe détaché sous Unix.
    killProcess(-child.pid, "SIGTERM");
    requested = true;
  } catch {
    try {
      requested = child.kill("SIGTERM") || requested;
    } catch {}
  }

  const forceTimer = setTimer(() => {
    if (child.exitCode != null) return;
    try {
      killProcess(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {}
    }
  }, 3000);
  forceTimer?.unref?.();
  return requested;
}

class ExecutionRegistry {
  constructor(options = {}) {
    this.entries = new Map();
    this.terminate = options.terminate ?? terminateProcessTree;
  }

  key(senderId, executionId) {
    return `${senderId}:${executionId}`;
  }

  register(senderId, executionId, child, markAborted = () => {}) {
    if (!Number.isInteger(senderId) || !isValidExecutionId(executionId) || !child) return false;
    const key = this.key(senderId, executionId);
    if (this.entries.has(key)) return false;
    this.entries.set(key, { senderId, executionId, child, markAborted });
    return true;
  }

  release(senderId, executionId) {
    if (!isValidExecutionId(executionId)) return false;
    return this.entries.delete(this.key(senderId, executionId));
  }

  cancel(senderId, executionId) {
    if (!isValidExecutionId(executionId)) return false;
    const entry = this.entries.get(this.key(senderId, executionId));
    if (!entry) return false;
    entry.markAborted();
    return this.terminate(entry.child);
  }

  cancelSender(senderId) {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.senderId !== senderId) continue;
      entry.markAborted();
      this.terminate(entry.child);
      this.entries.delete(this.key(entry.senderId, entry.executionId));
      count += 1;
    }
    return count;
  }

  cancelAll() {
    let count = 0;
    for (const entry of this.entries.values()) {
      entry.markAborted();
      this.terminate(entry.child);
      count += 1;
    }
    this.entries.clear();
    return count;
  }
}

module.exports = {
  ExecutionRegistry,
  isValidExecutionId,
  normalizeSpawnCommand,
  terminateProcessTree,
};
