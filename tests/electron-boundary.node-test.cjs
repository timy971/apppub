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
  assert.match(preload, /android-preparation:beginRollbackGuard/);
  assert.match(preload, /android-preparation:rollbackCreatedArtifacts/);
  assert.match(preload, /android-preparation:completeRollbackGuard/);
  assert.equal(preload.includes("android-preparation:writeFile"), false);
  assert.match(preload, /aab:inspect/);
  assert.equal(preload.includes("aab:writeReport"), false);
  assert.match(preload, /android-corrections:preview/);
  assert.match(preload, /android-corrections:apply/);
  assert.equal(preload.includes("android-corrections:writeFile"), false);
  assert.match(preload, /google-play:importServiceAccount/);
  assert.match(preload, /google-play:connectOAuth/);
  assert.match(preload, /google-play:oauthStatus/);
  assert.match(preload, /google-play:testConnection/);
  assert.match(preload, /google-play:publishInternal/);
  assert.match(preload, /google-play:disconnect/);
  assert.equal(preload.includes("google-play:getCredentials"), false);
  assert.equal(preload.includes("google-play:publishProduction"), false);
  assert.match(preload, /system:copyText/);
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
  const correctionBackup = main.indexOf('backupManager.create(project, "correction")');
  const correctionApply = main.indexOf("androidCorrectionManager.apply(project, desired, token)");
  assert.ok(correctionBackup > 0, "Android corrections must create a native backup");
  assert.ok(correctionApply > correctionBackup, "the native backup must precede every correction");
  assert.match(main, /android-preparation:beginRollbackGuard/);
  assert.match(main, /android-preparation:rollbackCreatedArtifacts/);
  assert.match(main, /android-preparation:completeRollbackGuard/);
  assert.match(main, /google-play:publishInternal/);
  assert.match(main, /GOOGLE_PLAY_KEYCHAIN_SERVICE/);
  assert.match(main, /buttons: \[resume \? "Reprendre" : "Publier sur internal", "Annuler"\]/);
  const playIdentityCheck = main.indexOf("archive = inspectAabArchive(aabPath)");
  const playConfirmation = main.indexOf('title: resume ? "Reprendre la publication ?"');
  assert.ok(playIdentityCheck > 0, "Google Play publication must inspect the real AAB identity");
  assert.ok(
    playConfirmation > playIdentityCheck,
    "the real AAB identity must be checked before native confirmation",
  );
  assert.equal(main.includes('ipcMain.handle("google-play:publishProduction"'), false);
});

test("startup maintenance and manifest recovery use dedicated business IPC only", () => {
  assert.match(main, /boot step start: \$\{name\}/);
  assert.match(main, /safeStep\("publication-maintenance"/);
  assert.match(main, /googlePlayResumeStore\.prune/);
  assert.match(main, /publicationWorkspaceManager\s*\.cleanupOrphans/);
  assert.match(main, /ipcMain\.handle\("publication-artifact:recordPreparation"/);
  assert.match(main, /ipcMain\.handle\("publication-artifact:recover"/);
  assert.match(preload, /publication-artifact:recordPreparation/);
  assert.match(preload, /publication-artifact:recover/);
  assert.equal(preload.includes("publication-artifact:readArbitraryFile"), false);
});

test("the packaged page declares a restrictive content security policy", () => {
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /default-src 'self'/);
  assert.match(index, /object-src 'none'/);
  assert.match(index, /frame-src 'none'/);
});


test("build subprocesses inherit detected Android SDK and automatic Java home", () => {
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
  assert.match(main, /function androidSdkEnvironment\(\)/);
  assert.match(main, /ANDROID_HOME: sdk/);
  assert.match(main, /ANDROID_SDK_ROOT: sdk/);
  assert.match(main, /require\("\.\/android-toolchain\.cjs"\)/);
  assert.match(
    main,
    /\.\.\.androidSdkEnvironment\(\), \.\.\.javaEnvironment\(\), \.\.\.safeEnv/,
  );
  assert.match(main, /const javaHome = guessJavaHome\(\)/);
});


test("les clés de stockage renderer restent synchronisées avec l'allowlist Electron", () => {
  const renderer = fs.readFileSync(path.join(ROOT, "src/core/storage/index.ts"), "utf8");
  const nativeStore = fs.readFileSync(path.join(ROOT, "electron/durable-store.cjs"), "utf8");

  const objectMatch = renderer.match(/export const STORAGE_KEYS = \{([\s\S]*?)\} as const;/);
  assert.ok(objectMatch, "STORAGE_KEYS introuvable");
  const rendererKeys = [...objectMatch[1].matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);

  const allowlistMatch = nativeStore.match(/const ALLOWED_KEYS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(allowlistMatch, "ALLOWED_KEYS introuvable");
  const allowedKeys = [...allowlistMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

  const missing = rendererKeys.filter((key) => !allowedKeys.includes(key));
  assert.deepEqual(
    missing,
    [],
    `clés renderer absentes de l'allowlist Electron : ${missing.join(", ")}`,
  );
});
