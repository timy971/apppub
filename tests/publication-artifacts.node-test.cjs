const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
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
  const copiedReport = JSON.parse(fs.readFileSync(promoted.reportPath, "utf8"));
  assert.equal(copiedReport.reportPath, promoted.reportPath);
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

test("records preparation notes and recovers the latest stable release after restart", async (t) => {
  const f = fixture(t);
  const a = args(f);
  fs.mkdirSync(path.dirname(a.aabPath), { recursive: true });
  fs.writeFileSync(a.aabPath, Buffer.from("signed-aab-fixture"));
  fs.writeFileSync(a.reportPath, JSON.stringify({ verdict: "ready" }));
  const promoted = await f.manager.promote(a);

  const prepared = f.manager.recordPreparation(promoted.artifactPath, {
    notes: "Corrections de stabilité et amélioration du suivi.",
    preparedAt: "2026-10-31T23:00:00.000Z",
  });

  const recovered = await f.manager.latestForProject({
    projectId: "project-1",
    applicationId: "app.victorytrack.android",
    versionName: "2.3.0",
    versionCode: 17,
  });

  assert.equal(prepared.manifestPath, promoted.manifestPath);
  assert.equal(recovered.artifactPath, promoted.artifactPath);
  assert.equal(recovered.reportPath, promoted.reportPath);
  assert.equal(recovered.manifestPath, promoted.manifestPath);
  assert.equal(recovered.notes, "Corrections de stabilité et amélioration du suivi.");
  assert.equal(recovered.preparedAt, "2026-10-31T23:00:00.000Z");
  assert.equal(recovered.sourceCommit, "a".repeat(40));
  assert.equal(recovered.artifactSha256, promoted.artifactSha256);
});

test("recovery ignores a stable artifact whose bytes no longer match its manifest", async (t) => {
  const f = fixture(t);
  const a = args(f);
  fs.mkdirSync(path.dirname(a.aabPath), { recursive: true });
  fs.writeFileSync(a.aabPath, Buffer.from("signed-aab-fixture"));
  fs.writeFileSync(a.reportPath, JSON.stringify({ verdict: "ready" }));
  const promoted = await f.manager.promote(a);
  f.manager.recordPreparation(promoted.artifactPath, { notes: "Version prête." });

  fs.writeFileSync(promoted.artifactPath, Buffer.from("tampered"));

  const recovered = await f.manager.latestForProject({
    projectId: "project-1",
    versionName: "2.3.0",
    versionCode: 17,
  });

  assert.equal(recovered, null);
});

test("records the committed Google Play result in the stable manifest", async (t) => {
  const f = fixture(t);
  const a = args(f);
  fs.mkdirSync(path.dirname(a.aabPath), { recursive: true });
  fs.writeFileSync(a.aabPath, Buffer.from("signed-aab-fixture"));
  fs.writeFileSync(a.reportPath, JSON.stringify({ verdict: "ready" }));
  const promoted = await f.manager.promote(a);

  const recorded = f.manager.recordGooglePlayResult(promoted.artifactPath, {
    packageName: "app.victorytrack.android",
    versionCode: 17,
    editId: "edit-17",
    accountEmail: "publisher@example.com",
    authMode: "oauth",
    resumed: true,
    recoveredCommit: false,
    committedAt: "2026-10-31T22:30:00.000Z",
  });

  assert.equal(recorded.manifestPath, promoted.manifestPath);
  const manifest = JSON.parse(fs.readFileSync(promoted.manifestPath, "utf8"));
  assert.deepEqual(manifest.googlePlay, {
    provider: "google-play",
    track: "internal",
    packageName: "app.victorytrack.android",
    versionCode: 17,
    releaseStatus: "completed",
    editId: "edit-17",
    accountEmail: "publisher@example.com",
    authMode: "oauth",
    resumed: true,
    recoveredCommit: false,
    committedAt: "2026-10-31T22:30:00.000Z",
  });
});

test("refuses to attach a Google Play result to the wrong stable AAB", async (t) => {
  const f = fixture(t);
  const a = args(f);
  fs.mkdirSync(path.dirname(a.aabPath), { recursive: true });
  fs.writeFileSync(a.aabPath, Buffer.from("signed-aab-fixture"));
  fs.writeFileSync(a.reportPath, JSON.stringify({ verdict: "ready" }));
  const promoted = await f.manager.promote(a);

  assert.throws(
    () =>
      f.manager.recordGooglePlayResult(promoted.artifactPath, {
        packageName: "app.other.android",
        versionCode: 17,
      }),
    /ne correspond pas au manifeste/,
  );
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


function writeRetentionArtifact(f, {
  dirName,
  versionName,
  versionCode,
  storedAt,
  applicationId = "app.victorytrack.android",
  projectId = "project-1",
}) {
  const dir = path.join(f.artifacts, projectId, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const bytes = Buffer.from(`${versionName}-${versionCode}-${storedAt}`);
  const artifactPath = path.join(dir, "app-release.aab");
  fs.writeFileSync(artifactPath, bytes);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  fs.writeFileSync(
    path.join(dir, "publication-manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      storedAt,
      project: { id: projectId, name: "VictoryTrack" },
      source: { commit: "a".repeat(40), branch: "main" },
      release: { applicationId, versionName, versionCode },
      artifact: {
        fileName: "app-release.aab",
        sizeBytes: bytes.length,
        sha256,
      },
    }),
  );
  return dir;
}

test("retention keeps the five newest artifacts and all artifacts for the active release", (t) => {
  const f = fixture(t);
  const dirs = [];
  for (let i = 1; i <= 8; i += 1) {
    dirs.push(
      writeRetentionArtifact(f, {
        dirName: `release-${i}`,
        versionName: i === 2 ? "2.3.0" : `2.${i}.0`,
        versionCode: i === 2 ? 17 : i,
        storedAt: `2026-10-${String(i).padStart(2, "0")}T12:00:00.000Z`,
      }),
    );
  }

  const result = f.manager.pruneRetention([
    {
      projectId: "project-1",
      applicationId: "app.victorytrack.android",
      versionName: "2.3.0",
      versionCode: 17,
    },
  ]);

  assert.equal(result.keepPerProject, 5);
  assert.equal(fs.existsSync(dirs[1]), true, "la version active doit être conservée même ancienne");
  for (const dir of dirs.slice(3)) {
    assert.equal(fs.existsSync(dir), true, "les cinq plus récents doivent être conservés");
  }
  assert.equal(fs.existsSync(dirs[0]), false);
  assert.equal(fs.existsSync(dirs[2]), false);
});

test("retention never deletes the last valid artifact", (t) => {
  const f = fixture(t);
  const only = writeRetentionArtifact(f, {
    dirName: "only",
    versionName: "1.0.0",
    versionCode: 1,
    storedAt: "2026-01-01T12:00:00.000Z",
  });

  const result = f.manager.pruneRetention(
    [{ projectId: "project-1", applicationId: "app.victorytrack.android" }],
    { keepPerProject: 1 },
  );

  assert.equal(fs.existsSync(only), true);
  assert.equal(result.removed.length, 0);
  assert.equal(result.kept.includes(only), true);
});

test("retention leaves unknown or invalid artifact folders untouched", (t) => {
  const f = fixture(t);
  const projectRoot = path.join(f.artifacts, "project-1");
  const unknown = path.join(projectRoot, "unknown-folder");
  fs.mkdirSync(unknown, { recursive: true });
  fs.writeFileSync(path.join(unknown, "notes.txt"), "do not delete");

  const invalid = path.join(projectRoot, "invalid-manifest");
  fs.mkdirSync(invalid, { recursive: true });
  fs.writeFileSync(path.join(invalid, "publication-manifest.json"), "{broken");

  const valid = writeRetentionArtifact(f, {
    dirName: "valid",
    versionName: "1.0.0",
    versionCode: 1,
    storedAt: "2026-01-01T12:00:00.000Z",
  });

  f.manager.pruneRetention(
    [{ projectId: "project-1", applicationId: "app.victorytrack.android" }],
    { keepPerProject: 1 },
  );

  assert.equal(fs.existsSync(unknown), true);
  assert.equal(fs.existsSync(invalid), true);
  assert.equal(fs.existsSync(valid), true);
});
