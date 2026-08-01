/* eslint-disable */

const fs = require("fs");
const path = require("path");

function sameArgs(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function findProjectRoot(cwd, accessRegistry, fsModule = fs) {
  const safeCwd = accessRegistry.resolveExisting(cwd);
  if (!safeCwd) return null;
  let cursor = safeCwd;
  while (true) {
    const packageFile = accessRegistry.resolveExisting(path.join(cursor, "package.json"));
    if (packageFile) {
      try {
        if (fsModule.statSync(packageFile).isFile()) return cursor;
      } catch {}
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function validateExecutionRequest(opts, accessRegistry, options = {}) {
  if (!opts || typeof opts !== "object") return { ok: false, error: "Requête invalide." };
  const fsModule = options.fsModule ?? fs;
  const command = path.basename(String(opts.cmd ?? ""));
  const args = Array.isArray(opts.args) ? opts.args : [];

  if (command === "adb" && sameArgs(args, ["--version"])) {
    return { ok: true, command: "adb", args, cwd: undefined, requiresTrust: false, envAllowed: false };
  }

  const cwd = accessRegistry.resolveExisting(opts.cwd);
  if (!cwd) return { ok: false, error: "Dossier de travail non autorisé." };
  const projectRoot = findProjectRoot(cwd, accessRegistry, fsModule);
  if (!projectRoot) return { ok: false, error: "Projet introuvable depuis le dossier de travail." };
  const androidDir = path.join(projectRoot, "android");
  const inProjectRoot = cwd === projectRoot;
  const inAndroidDir = cwd === accessRegistry.resolveExisting(androidDir);

  if (["npm", "npm.cmd"].includes(command) && inProjectRoot) {
    if (sameArgs(args, ["install"]) || sameArgs(args, ["run", "build"])) {
      return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: false };
    }
    if (sameArgs(args, ["install", "@capacitor/cli", "@capacitor/android", "@capacitor/core"])) {
      return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: false };
    }
  }

  if (["npx", "npx.cmd"].includes(command) && inProjectRoot) {
    if (sameArgs(args, ["cap", "add", "android"]) || sameArgs(args, ["cap", "sync", "android"])) {
      return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: false };
    }
  }

  if (command === "node" && inProjectRoot && args.length === 2) {
    if (args[0] === "scripts/version.mjs" && ["patch", "minor", "major"].includes(args[1])) {
      const script = accessRegistry.resolveExisting(path.join(projectRoot, args[0]));
      if (script) {
        return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: false };
      }
    }
  }

  if (command === "gradle" && inAndroidDir && sameArgs(args, ["-v"])) {
    return { ok: true, command, args, cwd, projectRoot, requiresTrust: false, envAllowed: false };
  }
  if (command === "gradle" && inAndroidDir && sameArgs(args, ["bundleRelease"])) {
    return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: true };
  }
  if (["gradlew", "gradlew.bat"].includes(command) && inAndroidDir && sameArgs(args, ["bundleRelease"])) {
    const wrapper = accessRegistry.resolveExisting(path.join(androidDir, command));
    if (wrapper) {
      return { ok: true, command, args, cwd, projectRoot, requiresTrust: true, envAllowed: true };
    }
  }

  return { ok: false, error: "Cette opération n'est pas autorisée par AppPublisher." };
}

module.exports = { findProjectRoot, sameArgs, validateExecutionRequest };
