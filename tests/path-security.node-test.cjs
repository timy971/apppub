const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  FileAccessRegistry,
  ProjectAccessRegistry,
  isDangerouslyBroadRoot,
} = require("../electron/path-security.cjs");

test("refuses filesystem, system and home roots", () => {
  assert.equal(isDangerouslyBroadRoot("/", { platform: "linux", homeDir: "/home/alice" }), true);
  assert.equal(
    isDangerouslyBroadRoot("/home", { platform: "linux", homeDir: "/home/alice" }),
    true,
  );
  assert.equal(
    isDangerouslyBroadRoot("/home/alice", { platform: "linux", homeDir: "/home/alice" }),
    true,
  );
  assert.equal(isDangerouslyBroadRoot("/tmp", { platform: "linux", homeDir: "/home/alice" }), true);
  assert.equal(
    isDangerouslyBroadRoot("/Volumes", { platform: "darwin", homeDir: "/Users/alice" }),
    true,
  );
  assert.equal(
    isDangerouslyBroadRoot("/home/alice/projects", {
      platform: "linux",
      homeDir: "/home/alice",
    }),
    false,
  );
});

test("authorizes only dialog-approved roots and safely resolves new descendants", (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-access-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const project = path.join(sandbox, "project");
  const outside = path.join(sandbox, "outside");
  fs.mkdirSync(project);
  fs.mkdirSync(outside);

  const registry = new ProjectAccessRegistry({
    filePath: path.join(sandbox, "roots.json"),
    homeDir: path.join(sandbox, "fake-home"),
    platform: "linux",
  });
  assert.equal(registry.resolveExisting(project), null);
  assert.equal(registry.approveExisting(project), fs.realpathSync(project));
  assert.equal(
    registry.resolveForCreate(path.join(project, ".apppublisher-backups", "one", "file")),
    path.join(fs.realpathSync(project), ".apppublisher-backups", "one", "file"),
  );
  assert.equal(registry.resolveForCreate(path.join(outside, "file")), null);

  const escapeLink = path.join(project, "escape");
  fs.symlinkSync(outside, escapeLink, "dir");
  assert.equal(registry.resolveForCreate(path.join(escapeLink, "stolen.txt")), null);
});

test("rejects renderer-controlled legacy roots and reloads only native approvals", (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-roots-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const project = path.join(sandbox, "project");
  fs.mkdirSync(project);
  const filePath = path.join(sandbox, "roots.json");
  fs.writeFileSync(filePath, JSON.stringify(["/", project]));
  const registry = new ProjectAccessRegistry({
    filePath,
    homeDir: path.join(sandbox, "fake-home"),
    platform: "linux",
  });
  assert.deepEqual(registry.load(), []);

  fs.writeFileSync(
    filePath,
    JSON.stringify({
      schemaVersion: 1,
      approvalMethod: "native-dialog",
      roots: ["/", project],
    }),
  );
  assert.deepEqual(registry.load(), [fs.realpathSync(project)]);
});

test("persists exact native file grants without exposing their parent folder", (t) => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-files-"));
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const selected = path.join(sandbox, "release.jks");
  const sibling = path.join(sandbox, "private.txt");
  fs.writeFileSync(selected, "keystore");
  fs.writeFileSync(sibling, "private");
  const filePath = path.join(sandbox, "grants.json");
  const first = new FileAccessRegistry({ filePath });
  assert.equal(first.approveExisting(selected), fs.realpathSync(selected));
  assert.equal(first.resolveExisting(sibling), null);

  const restarted = new FileAccessRegistry({ filePath });
  assert.deepEqual(restarted.load(), [fs.realpathSync(selected)]);
  assert.equal(restarted.resolveExisting(selected), fs.realpathSync(selected));
  assert.equal(restarted.resolveExisting(sibling), null);
});
