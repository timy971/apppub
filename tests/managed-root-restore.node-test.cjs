const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ProjectAccessRegistry } = require("../electron/path-security.cjs");

test("startup restores known roots before persisting AppPublisher internal roots", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
  const loadIndex = source.indexOf("const restored = projectAccess.load()");
  const artifactIndex = source.indexOf(
    "registerAllowedRoot(publicationArtifactManager.rootPath)",
  );

  assert.ok(loadIndex >= 0, "projectAccess.load() doit être présent au démarrage");
  assert.ok(artifactIndex > loadIndex, "la racine des artefacts doit être ajoutée après load()");
  assert.match(source, /for \(const projectPath of bindings\.projectPaths\)/);
  assert.match(source, /registerAllowedRoot\(projectPath\)/);
});

test("loading before adding an internal root preserves an existing managed project root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-roots-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const managed = path.join(root, "managed-project");
  const artifacts = path.join(root, "publication-artifacts");
  const registryFile = path.join(root, "known-roots.json");
  fs.mkdirSync(managed);
  fs.mkdirSync(artifacts);

  const first = new ProjectAccessRegistry({
    filePath: registryFile,
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  first.approveExisting(managed);

  const restarted = new ProjectAccessRegistry({
    filePath: registryFile,
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  restarted.load();
  restarted.approveExisting(artifacts);

  const roots = restarted.list();
  assert.equal(roots.length, 2);
  assert.ok(restarted.resolveExisting(managed));
  assert.ok(restarted.resolveExisting(artifacts));
});
