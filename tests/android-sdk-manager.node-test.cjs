const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  allowedPackage,
  findSdkmanager,
  inspectAndroidSdk,
  requiredAndroidPackages,
} = require("../electron/android-sdk-manager.cjs");

function touch(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "");
}

test("classifies a missing SDK as absent, not auto-installable", () => {
  const state = inspectAndroidSdk("/definitely/missing/apppublisher-sdk", {
    platform: "darwin",
  });
  assert.equal(state.present, false);
  assert.equal(state.installable, false);
  assert.equal(state.reason, "sdk-missing");
});

test("distinguishes missing components from a missing sdkmanager", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-sdk-no-manager-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const state = inspectAndroidSdk(root, { platform: "darwin" });
  assert.equal(state.present, true);
  assert.equal(state.ready, false);
  assert.equal(state.installable, false);
  assert.equal(state.reason, "command-line-tools-missing");
  assert.deepEqual(state.missingPackages, requiredAndroidPackages());
});

test("marks SDK components as automatically installable when sdkmanager exists", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-sdk-manager-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manager = path.join(root, "cmdline-tools", "latest", "bin", "sdkmanager");
  touch(manager);
  const state = inspectAndroidSdk(root, { platform: "darwin" });
  assert.equal(findSdkmanager(root, { platform: "darwin" }), manager);
  assert.equal(state.present, true);
  assert.equal(state.installable, true);
  assert.equal(state.reason, "components-missing");
});

test("detects a complete API 36 SDK toolchain", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-sdk-ready-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  touch(path.join(root, "platform-tools", "adb"));
  touch(path.join(root, "platforms", "android-36", "android.jar"));
  touch(path.join(root, "build-tools", "36.0.0", "aapt2"));
  touch(path.join(root, "cmdline-tools", "latest", "bin", "sdkmanager"));
  const state = inspectAndroidSdk(root, { platform: "darwin" });
  assert.equal(state.ready, true);
  assert.equal(state.installable, false);
  assert.deepEqual(state.missingPackages, []);
  assert.equal(state.reason, "ready");
});

test("installer only accepts Android SDK package identifiers from the allowlist", () => {
  assert.equal(allowedPackage("platform-tools"), true);
  assert.equal(allowedPackage("platforms;android-36"), true);
  assert.equal(allowedPackage("build-tools;36.0.0"), true);
  assert.equal(allowedPackage("extras;google;m2repository"), false);
  assert.equal(allowedPackage("../../evil"), false);
});
