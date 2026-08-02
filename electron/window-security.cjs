/* eslint-disable */

const path = require("path");
const { fileURLToPath } = require("url");

function isAllowedAppNavigation(target, options = {}) {
  if (typeof target !== "string" || target.length > 4096) return false;
  try {
    const parsed = new URL(target);
    if (options.devUrl) {
      const expected = new URL(options.devUrl);
      return (
        parsed.origin === expected.origin &&
        parsed.username === "" &&
        parsed.password === ""
      );
    }
    if (!options.indexPath || parsed.protocol !== "file:") return false;
    if (parsed.username || parsed.password) return false;
    return path.resolve(fileURLToPath(parsed)) === path.resolve(options.indexPath);
  } catch {
    return false;
  }
}

function installWindowGuards(win, options = {}) {
  if (!win?.webContents) throw new Error("Fenêtre Electron invalide.");
  const allowed = (target) => isAllowedAppNavigation(target, options);
  const blockUnlessAllowed = (event, target) => {
    if (!allowed(target)) event.preventDefault();
  };
  win.webContents.on("will-navigate", blockUnlessAllowed);
  win.webContents.on("will-redirect", blockUnlessAllowed);
  win.webContents.on("will-attach-webview", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
}

module.exports = { installWindowGuards, isAllowedAppNavigation };
