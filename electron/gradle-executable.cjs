/* eslint-disable */

const fs = require("fs");
const path = require("path");

/**
 * Rend le wrapper Gradle local exécutable sans exposer la commande système
 * `chmod` au renderer. Tous les chemins restent soumis au confinement du
 * processus principal via `resolveWithinAllowed`.
 */
function ensureGradleWrapperExecutable(
  projectPath,
  resolveWithinAllowed,
  platform = process.platform,
) {
  if (typeof resolveWithinAllowed !== "function") {
    return { ok: false, errorCode: "internal-error" };
  }

  const safeProject = resolveWithinAllowed(projectPath);
  if (!safeProject) return { ok: false, errorCode: "project-not-authorized" };

  const wrapperName = platform === "win32" ? "gradlew.bat" : "gradlew";
  const wrapperPath = resolveWithinAllowed(path.join(safeProject, "android", wrapperName));
  if (!wrapperPath) return { ok: false, errorCode: "wrapper-not-found" };

  try {
    const stat = fs.statSync(wrapperPath);
    if (!stat.isFile()) return { ok: false, errorCode: "wrapper-not-file" };

    if (platform !== "win32") {
      fs.chmodSync(wrapperPath, stat.mode | 0o111);
      fs.accessSync(wrapperPath, fs.constants.X_OK);
    }

    return { ok: true, path: wrapperPath };
  } catch {
    return { ok: false, errorCode: "chmod-failed" };
  }
}

module.exports = { ensureGradleWrapperExecutable };
