const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { MacUpdateManager } = require("../electron/update-manager.cjs");

function fixture(overrides = {}) {
  const updater = new EventEmitter();
  updater.checkForUpdates = async () => {};
  updater.downloadUpdate = async () => {};
  updater.quitAndInstall = () => {};
  const dialogs = [];
  const dialog = {
    showMessageBox: async (_window, options) => {
      dialogs.push(options);
      return { response: 0 };
    },
  };
  const manager = new MacUpdateManager({
    app: { isPackaged: true, getVersion: () => "1.0.0" },
    dialog,
    updater,
    platform: "darwin",
    setTimeoutFn: () => 1,
    clearTimeoutFn: () => {},
    setIntervalFn: () => 2,
    clearIntervalFn: () => {},
    ...overrides,
  });
  return { manager, updater, dialogs };
}

test("les mises à jour sont désactivées hors application macOS installée", () => {
  const { manager } = fixture({
    app: { isPackaged: false, getVersion: () => "1.0.0" },
  });
  assert.equal(manager.start(), false);
});

test("une mise à jour disponible est proposée puis téléchargée", async () => {
  const { manager, updater, dialogs } = fixture();
  let downloads = 0;
  updater.downloadUpdate = async () => downloads++;
  assert.equal(manager.start(), true);
  updater.emit("update-available", { version: "1.1.0" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(downloads, 1);
  assert.match(dialogs[0].message, /1\.1\.0/);
});

test("une mise à jour téléchargée peut redémarrer et s’installer", async () => {
  const { manager, updater } = fixture();
  let installs = 0;
  updater.quitAndInstall = () => installs++;
  manager.start();
  updater.emit("update-downloaded", { version: "1.1.0" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(installs, 1);
});

test("une vérification manuelle confirme que la version est à jour", async () => {
  const { manager, updater, dialogs } = fixture();
  manager.start();
  updater.checkForUpdates = async () => updater.emit("update-not-available");
  await manager.checkNow();
  assert.match(dialogs[0].message, /dernière version/);
});

test("une erreur automatique reste discrète mais une erreur manuelle est expliquée", async () => {
  const { manager, updater, dialogs } = fixture();
  manager.start();
  updater.emit("error", new Error("network"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogs.length, 0);
  updater.checkForUpdates = async () => {
    throw new Error("offline");
  };
  await manager.checkNow();
  assert.match(dialogs[0].message, /n’a pas pu/);
});

test("une erreur émise puis rejetée n'affiche pas deux dialogues", async () => {
  const { manager, updater, dialogs } = fixture();
  manager.start();
  updater.checkForUpdates = async () => {
    const error = new Error("offline");
    updater.emit("error", error);
    throw error;
  };
  await manager.checkNow();
  assert.equal(dialogs.length, 1);
});
