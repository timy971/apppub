const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BackupManager } = require("../electron/backup-manager.cjs");
const { ProjectAccessRegistry } = require("../electron/path-security.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-backup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  fs.mkdirSync(path.join(project, "android", "app"), { recursive: true });
  fs.writeFileSync(path.join(project, "package.json"), '{"name":"demo"}\n');
  fs.writeFileSync(path.join(project, "version.json"), '{"version":"1.0.0"}\n');
  fs.writeFileSync(path.join(project, "android", "app", "build.gradle"), "android {}\n");
  const access = new ProjectAccessRegistry({
    filePath: path.join(root, "roots.json"),
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  access.approveExisting(project);
  return { project, manager: new BackupManager(access) };
}

test("creates the very first nested snapshot and restores it atomically", (t) => {
  const { project, manager } = fixture(t);
  const original = fs.readFileSync(path.join(project, "android", "app", "build.gradle"), "utf8");
  const snapshot = manager.create(project, "build");
  assert.ok(snapshot.files.some((file) => file.path === "android/app/build.gradle"));
  assert.equal(fs.existsSync(path.join(snapshot.location, "android", "app", "build.gradle")), true);

  fs.writeFileSync(path.join(project, "android", "app", "build.gradle"), "changed\n");
  manager.restore(project, snapshot.location, snapshot.files);
  assert.equal(
    fs.readFileSync(path.join(project, "android", "app", "build.gradle"), "utf8"),
    original,
  );
});

test("rejects a tampered snapshot before changing the project", (t) => {
  const { project, manager } = fixture(t);
  const snapshot = manager.create(project, "manual");
  fs.writeFileSync(path.join(snapshot.location, "package.json"), "tampered");
  fs.writeFileSync(path.join(project, "version.json"), "current-project-state");
  assert.throws(() => manager.restore(project, snapshot.location, snapshot.files), /altéré/);
  assert.equal(
    fs.readFileSync(path.join(project, "version.json"), "utf8"),
    "current-project-state",
  );
});

test("refuses restoring files outside the fixed backup manifest", (t) => {
  const { project, manager } = fixture(t);
  const snapshot = manager.create(project, "manual");
  assert.throws(
    () => manager.restore(project, snapshot.location, [{ path: "../../outside", size: 0 }]),
    /Métadonnées/,
  );
});

test("captures Android SDK variables for a correction snapshot", (t) => {
  const { project, manager } = fixture(t);
  fs.writeFileSync(
    path.join(project, "android", "variables.gradle"),
    "ext { targetSdkVersion = 35 }\n",
  );
  const snapshot = manager.create(project, "correction");
  assert.ok(snapshot.files.some((file) => file.path === "android/variables.gradle"));
});
