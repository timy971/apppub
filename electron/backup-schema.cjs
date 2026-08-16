/* eslint-disable */

/**
 * Shared contract for native snapshots and their durable metadata.
 * Keeping this list in one place prevents the backup writer and the store
 * validator from accepting different records.
 */
const SNAPSHOT_FILES = Object.freeze([
  "version.json",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "capacitor.config.json",
  "capacitor.config.ts",
  "capacitor.config.js",
  "CHANGELOG.md",
  "android/app/build.gradle",
  "android/app/build.gradle.kts",
  "android/variables.gradle",
]);

const BACKUP_REASONS = Object.freeze([
  "android-preparation",
  "build",
  "correction",
  "manual",
  "publish",
  "version",
]);
const REMOVABLE_GENERATED_PATHS = Object.freeze([
  "android",
  "node_modules",
  "dist",
  "build",
  "out",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "capacitor.config.json",
  "capacitor.config.ts",
  "capacitor.config.js",
]);
const MAX_STORED_BACKUPS = 20;

function safeRelativeFile(value) {
  return typeof value === "string" && SNAPSHOT_FILES.includes(value);
}

module.exports = {
  BACKUP_REASONS,
  MAX_STORED_BACKUPS,
  REMOVABLE_GENERATED_PATHS,
  SNAPSHOT_FILES,
  safeRelativeFile,
};
