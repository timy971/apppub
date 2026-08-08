const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { BackupManager } = require("../electron/backup-manager.cjs");
const { SNAPSHOT_FILES } = require("../electron/backup-schema.cjs");
const { DurableStore } = require("../electron/durable-store.cjs");
const { ProjectAccessRegistry } = require("../electron/path-security.cjs");

test("persists a correction snapshot containing every supported project file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-backup-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const project = path.join(root, "project");
  for (const relative of SNAPSHOT_FILES) {
    const target = path.join(project, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${relative}\n`);
  }

  const access = new ProjectAccessRegistry({
    filePath: path.join(root, "roots.json"),
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  access.approveExisting(project);

  const snapshot = new BackupManager(access).create(project, "correction");
  assert.equal(snapshot.files.length, SNAPSHOT_FILES.length);

  const record = {
    id: "backup-1",
    projectId: "project-1",
    createdAt: new Date().toISOString(),
    reason: "correction",
    files: snapshot.files,
    location: snapshot.location,
  };
  const filePath = path.join(root, "data", "store.json");
  const store = new DurableStore(filePath);

  assert.deepEqual(store.set("backups", [record]), { ok: true });
  assert.deepEqual(new DurableStore(filePath).get("backups").value, [record]);
});

test("reports the rejected backup field without exposing unrelated metadata", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-backup-error-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new DurableStore(path.join(root, "store.json"));

  const result = store.set("backups", [
    {
      id: "backup-1",
      projectId: "project-1",
      createdAt: new Date().toISOString(),
      reason: "build",
      files: [{ path: "secrets/release-password.txt", size: 10 }],
      location: "/private/project/.apppublisher-backups/secret-location",
    },
  ]);

  assert.equal(result.ok, false);
  assert.match(result.error, /backups/);
  assert.match(result.error, /secrets\/release-password\.txt/);
  assert.doesNotMatch(result.error, /secret-location/);
});
