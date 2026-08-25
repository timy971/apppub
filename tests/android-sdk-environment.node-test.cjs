const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  configureAndroidSdkEnvironment,
  resolveAndroidSdkPath,
} = require("../electron/android-sdk-environment.cjs");

function macFixture(t) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-android-sdk-"));
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));
  const sdkPath = path.join(homeDir, "Library", "Android", "sdk");
  fs.mkdirSync(path.join(sdkPath, "platform-tools"), { recursive: true });
  return { homeDir, sdkPath };
}

test("detects the standard Android SDK installed by Android Studio on macOS", (t) => {
  const { homeDir, sdkPath } = macFixture(t);
  assert.equal(resolveAndroidSdkPath({ env: {}, platform: "darwin", homeDir }), sdkPath);
});

test("exports the detected SDK to every Gradle-compatible Android variable", (t) => {
  const { homeDir, sdkPath } = macFixture(t);
  const env = { PATH: "/usr/bin:/bin" };

  assert.equal(configureAndroidSdkEnvironment({ env, platform: "darwin", homeDir }), sdkPath);
  assert.equal(env.ANDROID_HOME, sdkPath);
  assert.equal(env.ANDROID_SDK_ROOT, sdkPath);
  assert.ok(env.PATH.split(":").includes(path.join(sdkPath, "platform-tools")));
});

test("replaces an invalid Android variable with the SDK that is actually installed", (t) => {
  const { homeDir, sdkPath } = macFixture(t);
  const env = { ANDROID_HOME: path.join(homeDir, "missing-sdk"), PATH: "/usr/bin" };

  assert.equal(configureAndroidSdkEnvironment({ env, platform: "darwin", homeDir }), sdkPath);
  assert.equal(env.ANDROID_HOME, sdkPath);
  assert.equal(env.ANDROID_SDK_ROOT, sdkPath);
});
