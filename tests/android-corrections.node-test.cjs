const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { AndroidCorrectionManager } = require("../electron/android-corrections.cjs");

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-correction-"));
  fs.mkdirSync(path.join(root, "android", "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"fixture"}\n');
  fs.writeFileSync(
    path.join(root, options.capacitorTs ? "capacitor.config.ts" : "capacitor.config.json"),
    options.capacitorTs
      ? "export default { appId: 'app.old.demo', appName: 'Demo', webDir: 'dist' };\n"
      : '{\n  "appId": "app.old.demo",\n  "appName": "Demo",\n  "webDir": "dist"\n}\n',
  );
  fs.writeFileSync(
    path.join(root, "android", "app", options.kotlin ? "build.gradle.kts" : "build.gradle"),
    options.kotlin
      ? 'android {\n  defaultConfig {\n    applicationId = "app.old.demo"\n    minSdk = 24\n    targetSdk = 34\n    versionCode = 4\n    versionName = "1.0.0"\n  }\n}\n'
      : 'android {\n  defaultConfig {\n    applicationId "app.old.demo"\n    minSdkVersion 24\n    targetSdkVersion 34\n    versionCode 4\n    versionName "1.0.0"\n  }\n}\n',
  );
  const access = {
    resolveExisting(input) {
      const resolved = path.resolve(input);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
      return fs.existsSync(resolved) ? resolved : null;
    },
  };
  return { root, manager: new AndroidCorrectionManager(access) };
}

test("previews and applies package, version and SDK corrections atomically", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const desired = {
    packageName: "app.lovable.cranioscan.twa",
    versionName: "2.1.0",
    versionCode: 18,
    targetSdk: 36,
  };
  const preview = manager.preview(root, desired);
  assert.equal(preview.canApply, true);
  assert.equal(preview.sensitive, true);
  assert.deepEqual(preview.changedFiles.sort(), [
    "android/app/build.gradle",
    "capacitor.config.json",
  ]);
  assert.equal(preview.actions.length, 5);

  const result = manager.apply(root, desired, preview.token);
  assert.equal(result.applied, true);
  const capacitor = JSON.parse(fs.readFileSync(path.join(root, "capacitor.config.json"), "utf8"));
  const gradle = fs.readFileSync(path.join(root, "android", "app", "build.gradle"), "utf8");
  assert.equal(capacitor.appId, desired.packageName);
  assert.match(gradle, /applicationId "app\.lovable\.cranioscan\.twa"/);
  assert.match(gradle, /versionName "2\.1\.0"/);
  assert.match(gradle, /versionCode 18/);
  assert.match(gradle, /targetSdkVersion 36/);
});

test("supports literal TypeScript Capacitor config and Kotlin Gradle DSL", (t) => {
  const { root, manager } = fixture({ capacitorTs: true, kotlin: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const desired = { packageName: "com.example.release", versionCode: 9 };
  const preview = manager.preview(root, desired);
  assert.equal(preview.canApply, true);
  manager.apply(root, desired, preview.token);
  assert.match(
    fs.readFileSync(path.join(root, "capacitor.config.ts"), "utf8"),
    /appId: 'com\.example\.release'/,
  );
  const gradle = fs.readFileSync(path.join(root, "android", "app", "build.gradle.kts"), "utf8");
  assert.match(gradle, /applicationId = "com\.example\.release"/);
  assert.match(gradle, /versionCode = 9/);
});

test("rejects a stale preview token before writing", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const desired = { versionCode: 5 };
  const preview = manager.preview(root, desired);
  const gradlePath = path.join(root, "android", "app", "build.gradle");
  fs.appendFileSync(gradlePath, "// user edit\n");
  assert.throws(() => manager.apply(root, desired, preview.token), /projet a changé/);
  assert.match(fs.readFileSync(gradlePath, "utf8"), /versionCode 4/);
});

test("blocks ambiguous flavor values instead of guessing", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const gradlePath = path.join(root, "android", "app", "build.gradle");
  fs.appendFileSync(gradlePath, 'productFlavors { demo { applicationId "app.flavor.demo" } }\n');
  const preview = manager.preview(root, { packageName: "com.example.release" });
  assert.equal(preview.canApply, false);
  assert.match(preview.blocked.join(" "), /plusieurs fois/);
  assert.equal(fs.readFileSync(gradlePath, "utf8").includes("com.example.release"), false);
});

test("rejects unsafe desired values", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => manager.preview(root, { packageName: "Not Valid" }), /invalide/);
  assert.throws(() => manager.preview(root, { versionCode: 0 }), /invalide/);
  assert.throws(() => manager.preview(root, { targetSdk: 999 }), /invalide/);
});

test("synchronizes Capacitor's initial 1.0 to 1.0.0 without incrementing the build", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "android", "app", "build.gradle");
  const original = fs
    .readFileSync(file, "utf8")
    .replace('versionName "1.0.0"', 'versionName "1.0"')
    .replace("versionCode 4", "versionCode 1");
  fs.writeFileSync(file, original);
  let backups = 0;
  const snapshot = { location: "/snapshot", files: [] };
  const backup = () => {
    assert.equal(fs.readFileSync(file, "utf8"), original);
    backups += 1;
    return snapshot;
  };
  const result = manager.syncVersion(root, "1.0.0", 1, backup);
  assert.equal(result.changed, true);
  assert.equal(result.backup, snapshot);
  assert.deepEqual(result.changedFiles, ["android/app/build.gradle"]);
  assert.equal(
    fs.readFileSync(file, "utf8"),
    original.replace('versionName "1.0"', 'versionName "1.0.0"'),
  );
  assert.deepEqual(manager.syncVersion(root, "1.0.0", 1, backup), { changed: false });
  assert.equal(backups, 1);
});

test("uses the selected version and build for both Groovy and Kotlin projects", (t) => {
  for (const kotlin of [false, true]) {
    const { root, manager } = fixture({ kotlin });
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, "android", "app", kotlin ? "build.gradle.kts" : "build.gradle");
    manager.syncVersion(root, "2.7.12", 42);
    const content = fs.readFileSync(file, "utf8");
    assert.match(content, /versionName\s*(?:=\s*)?"2\.7\.12"/);
    assert.match(content, /versionCode\s*(?:=\s*)?42\b/);
    assert.match(content, /applicationId\s*(?:=\s*)?"app\.old\.demo"/);
  }
});

test("leaves computed versions and flavors unchanged for final AAB validation", (t) => {
  for (const declaration of [
    "versionCode = buildNumber",
    "versionCode = 4 + buildOffset",
    'versionName "1.0.${patch}"',
    'versionName "1.0.0" + suffix',
    'versionName "1.0.0"\n  productFlavors { demo { versionName "2.0.0" } }',
    'versionName "1.0.0"\n  productFlavors { demo { versionName project.demoVersion } }',
  ]) {
    const { root, manager } = fixture();
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, "android", "app", "build.gradle");
    const original = fs
      .readFileSync(file, "utf8")
      .replace(
        declaration.startsWith("versionCode") ? "versionCode 4" : 'versionName "1.0.0"',
        declaration,
      );
    fs.writeFileSync(file, original);
    const result = manager.syncVersion(root, "1.0.0", 1, () => assert.fail("Unexpected backup"));
    assert.equal(result.skipped, true);
    assert.equal(fs.readFileSync(file, "utf8"), original);
  }
});

test("stops version synchronization if the backup fails or inputs are invalid", (t) => {
  const { root, manager } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "android", "app", "build.gradle");
  const original = fs.readFileSync(file, "utf8");
  assert.throws(
    () =>
      manager.syncVersion(root, "1.2.3", 5, () => {
        throw new Error("Backup failed");
      }),
    /Backup failed/,
  );
  assert.throws(() => manager.syncVersion(root, "", 1), /invalide/);
  assert.throws(() => manager.syncVersion(root, "1.0.0", 0), /invalide/);
  assert.throws(() => manager.syncVersion(root, "1.0.0", 1.5), /invalide/);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});
