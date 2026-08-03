const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const preload = fs.readFileSync(path.join(root, "electron/preload.cjs"), "utf8");
const main = fs.readFileSync(path.join(root, "electron/main.cjs"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("the renderer has no generic filesystem or secret-reading bridge", () => {
  for (const forbidden of [
    "projects:registerRoots",
    "fs:mkdir",
    "fs:writeText",
    "fs:writeJson",
    "fs:copyFile",
    "secrets:get",
    "exec:validateEnv",
  ]) {
    assert.equal(preload.includes(forbidden), false, `${forbidden} must not be exposed`);
  }

  assert.match(preload, /backups:create/);
  assert.equal(preload.includes("gradle:writeBuildFile"), false);
  assert.match(preload, /gradle:ensureSigningPatch/);
  assert.match(preload, /projects:reauthorizeFolder/);
  assert.match(preload, /signing:prepareBuild/);
  assert.match(preload, /git:inspectRemote/);
  assert.match(preload, /git:clone/);
  assert.match(preload, /git:status/);
  assert.match(preload, /git:check/);
  assert.match(preload, /git:sync/);
  assert.equal(preload.includes("git:run"), false);
  assert.match(preload, /android-preparation:inspect/);
  assert.match(preload, /android-preparation:createConfig/);
  assert.equal(preload.includes("android-preparation:writeFile"), false);
});

test("the main process does not register removed generic IPC handlers", () => {
  for (const forbidden of [
    'ipcMain.handle("projects:registerRoots"',
    'ipcMain.handle("fs:mkdir"',
    'ipcMain.handle("fs:writeText"',
    'ipcMain.handle("fs:writeJson"',
    'ipcMain.handle("fs:copyFile"',
    'ipcMain.handle("gradle:writeBuildFile"',
    'ipcMain.handle("secrets:get"',
    'ipcMain.handle("exec:validateEnv"',
  ]) {
    assert.equal(main.includes(forbidden), false, `${forbidden} must stay removed`);
  }
});

test("the packaged page declares a restrictive content security policy", () => {
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /default-src 'self'/);
  assert.match(index, /object-src 'none'/);
  assert.match(index, /frame-src 'none'/);
});
