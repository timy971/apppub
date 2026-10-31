const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  PublicationArtifactManager,
} = require("../electron/publication-artifacts.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-artifacts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "workspace");
  const source = path.join(root, "managed-project");
  const artifacts = path.join(root, "artifacts");
  fs.mkdirSync(workspace);
  fs.mkdirSync(source);

  const workspaceManager = {
    async assertWorkspaceOwner(workspacePath, projectPath) {
      assert.equal(path.resolve(workspacePath), path.resolve(workspace));
      assert.equal(path.resolve(projectPath), path.resolve(source));
      return path.resolve(workspace);
    },
  };
  const manager = new PublicationArtifactManager(artifacts, workspaceManager, {
    now: () => 1_700_000_000_000,
    randomBytes: () => Buffer.from("01020304", "hex"),
  });
  return { root, workspace, source, artifacts, manager };
}

function args(f, overrides = {}) {
  return {
    projectId: "project-1",
    projectName: "VictoryTrack",
    projectPath: f.source,
    workspacePath: f.workspace,
    aabPath: path.join(f.workspace, "android/app/build/outputs/bundle/release/app-release.aab"),
    reportPath: path.join(
      f.workspace,
      "android/app/build/outputs/bundle/release/app-release.aab.apppublisher-report.json",
    ),
    sourceSha: "a".repeat(40),
    branch: "main",
    applicationId: "app.victorytrack.android",
    versionName: "2.3.0",
    versionCode: 17,
    signerSha256: "BB:CC:DD:EE",
    corrections: ["android/app/build.gradle", "version.json"],
    adjustments: [{ kind: "version-code", from: 16, to: 17 }],
    ...overrides,
  };
}

test("promotes AAB, report and manifest into stable AppPublisher storage", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.dirname(args(f).aabPath), { recursive: true });
  fs.writeFileSync(args(f).aabPath, Buffer.from("signed-aab-fixture"));
  fs.writeFileSync(args(f).reportPath, JSON.stringify({ verdict: "ready" }));

  const promoted = await f.manager.promote(args(f));

  assert.equal(fs.existsSync(promoted.artifactPath), true);
  assert.equal(fs.existsSync(promoted.reportPath), true);
  assert.equal(fs.existsSync(promoted.manifestPath), true);
  assert.match(promoted.artifactPath, /project-1/);
  assert.match(promoted.artifactPath, /2\.3\.0-17-aaaaaaaaaa/);

  const manifest = JSON.parse(fs.readFileSync(promoted.manifestPath, "utf8"));
  assert.equal(manifest.source.commit, "a".repeat(40));
  assert.equal(manifest.release.applicationId, "app.victorytrack.android");
  assert.equal(manifest.release.versionName, "2.3.0");
  assert.equal(manifest.release.versionCode, 17);
  assert.equal(manifest.artifact.sha256, promoted.artifactSha256);
  assert.equal(manifest.artifact.sizeBytes, Buffer.byteLength("signed-aab-fixture"));
  assert.deepEqual(manifest.corrections, ["android/app/build.gradle", "version.json"]);
});

test("refuses to promote an AAB outside the verified workspace", async (t) => {
  const f = fixture(t);
  const outside = path.join(f.root, "outside.aab");
  fs.writeFileSync(outside, "outside");
  await assert.rejects(
    f.manager.promote(args(f, { aabPath: outside, reportPath: undefined })),
    /n’appartient pas au workspace attendu/,
  );
});

test("refuses a changed AAB when the validated hash no longer matches", async (t) => {
  const f = fixture(t);
  const a = args(f, { reportPath: undefined, artifactSha256: "A".repeat(64) });
  fs.mkdirSync(path.dirname(a.aabPath), { recursive: true });
  fs.writeFileSync(a.aabPath, "mutated-after-validation");

  await assert.rejects(f.manager.promote(a), /empreinte du fichier Android a changé/);

  const projectDir = path.join(f.artifacts, "project-1");
  assert.equal(fs.existsSync(projectDir), false);
});
