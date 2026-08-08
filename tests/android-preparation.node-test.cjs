const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  AndroidPreparationManager,
  inspectAndroidPreparation,
  safeWebDir,
} = require("../electron/android-preparation.cjs");
const { ProjectAccessRegistry } = require("../electron/path-security.cjs");

function projectFixture(t, packageJson) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-android-prepare-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "package.json"), JSON.stringify(packageJson));
  const access = new ProjectAccessRegistry({
    filePath: path.join(root, "roots.json"),
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  access.approveExisting(project);
  return { project, manager: new AndroidPreparationManager(access) };
}

test("classifies a Vite repository as preparable and infers safe defaults", (t) => {
  const { project } = projectFixture(t, {
    name: "cranio-scan",
    displayName: "CrânioScan",
    scripts: { build: "vite build" },
  });
  fs.writeFileSync(path.join(project, "bun.lock"), "");

  const analysis = inspectAndroidPreparation(project);
  assert.equal(analysis.status, "preparable");
  assert.equal(analysis.packageManager, "npm");
  assert.equal(analysis.appName, "CrânioScan");
  assert.equal(analysis.applicationId, "app.cranioscan.android");
  assert.equal(analysis.webDir, "dist");
  assert.ok(analysis.changes.some((change) => change.includes("capacitor.config.json")));
  assert.ok(analysis.changes.some((change) => change.includes("7.6.8")));
});

test("classifies a Lovable Vite export without Capacitor or android as preparable", (t) => {
  const { project } = projectFixture(t, {
    name: "lovable-new-app",
    private: true,
    scripts: { build: "vite build" },
    dependencies: { react: "18.3.1" },
    devDependencies: { vite: "8.0.16" },
  });
  fs.writeFileSync(path.join(project, "bun.lock"), "");

  const analysis = inspectAndroidPreparation(project);
  assert.equal(analysis.status, "preparable");
  assert.equal(analysis.hasAndroid, false);
  assert.equal(analysis.hasCapacitorConfig, false);
  assert.equal(analysis.packageManager, "npm");
  assert.equal(analysis.webDir, "dist");
});

test("blocks server-rendered Next.js projects and incomplete Android folders", (t) => {
  const { project } = projectFixture(t, {
    name: "portal",
    scripts: { build: "next build" },
  });
  assert.equal(inspectAndroidPreparation(project).status, "blocked");
  assert.match(inspectAndroidPreparation(project).blockers.join(" "), /serveur/);

  fs.mkdirSync(path.join(project, "android"));
  const incomplete = inspectAndroidPreparation(project);
  assert.equal(incomplete.status, "blocked");
  assert.match(incomplete.blockers.join(" "), /incomplet/);
});

test("recognizes a complete Android project as ready", (t) => {
  const { project } = projectFixture(t, {
    name: "ready-app",
    scripts: { build: "vite build" },
    dependencies: {
      "@capacitor/core": "^7.0.0",
      "@capacitor/android": "^7.0.0",
    },
    devDependencies: { "@capacitor/cli": "^7.0.0" },
  });
  fs.mkdirSync(path.join(project, "android", "app"), { recursive: true });
  fs.writeFileSync(path.join(project, "android", "gradlew"), "");
  fs.writeFileSync(path.join(project, "android", "app", "build.gradle"), "android {}");
  fs.writeFileSync(
    path.join(project, "capacitor.config.json"),
    JSON.stringify({
      appId: "app.ready.android",
      appName: "Ready",
      webDir: "dist",
    }),
  );
  const analysis = inspectAndroidPreparation(project);
  assert.equal(analysis.status, "ready");
  assert.deepEqual(analysis.blockers, []);
});

test("creates a verified Capacitor config atomically and never overwrites it", (t) => {
  const { project, manager } = projectFixture(t, {
    name: "demo",
    scripts: { build: "vite build" },
  });
  const request = {
    appName: "Demo",
    applicationId: "app.demo.android",
    webDir: "dist",
  };
  const created = manager.createConfig(project, request);
  assert.equal(created.created, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(created.path, "utf8")), {
    appId: "app.demo.android",
    appName: "Demo",
    webDir: "dist",
  });

  fs.writeFileSync(created.path, '{"appId":"app.keep.android"}\n');
  const second = manager.createConfig(project, request);
  assert.equal(second.created, false);
  assert.equal(JSON.parse(fs.readFileSync(created.path, "utf8")).appId, "app.keep.android");
});

test("rejects unsafe output directories and invalid Android identifiers", (t) => {
  const { project, manager } = projectFixture(t, {
    name: "demo",
    scripts: { build: "vite build" },
  });
  assert.equal(safeWebDir("../outside"), null);
  assert.equal(safeWebDir("android/assets"), null);
  assert.equal(safeWebDir("dist/mobile"), "dist/mobile");
  assert.throws(
    () =>
      manager.createConfig(project, {
        appName: "Demo",
        applicationId: "Not Valid",
        webDir: "dist",
      }),
    /identifiant Android/,
  );
});

test("warns when a repository documents environment variables without a local env file", (t) => {
  const { project } = projectFixture(t, {
    name: "env-app",
    scripts: { build: "vite build" },
  });
  fs.writeFileSync(path.join(project, ".env.example"), "VITE_API_URL=\n");
  const analysis = inspectAndroidPreparation(project);
  assert.equal(analysis.status, "preparable");
  assert.match(analysis.warnings.join(" "), /\.env\.example/);
});

test("rollback guard removes only artifacts created during Android preparation", (t) => {
  const { project, manager } = projectFixture(t, {
    name: "rollback-app",
    scripts: { build: "vite build" },
  });
  fs.writeFileSync(path.join(project, "bun.lock"), "keep");
  const request = {
    appName: "Rollback App",
    applicationId: "app.rollback.android",
    webDir: "dist",
  };
  const { token } = manager.beginRollbackGuard(project, request);

  fs.mkdirSync(path.join(project, "android"), { recursive: true });
  fs.mkdirSync(path.join(project, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(project, "dist"), { recursive: true });
  fs.writeFileSync(path.join(project, "capacitor.config.json"), "{}");
  fs.writeFileSync(path.join(project, "package-lock.json"), "{}");

  const result = manager.rollbackCreatedArtifacts(project, token);
  assert.deepEqual(
    new Set(result.removed),
    new Set(["android", "node_modules", "package-lock.json", "capacitor.config.json", "dist"]),
  );
  assert.equal(fs.existsSync(path.join(project, "android")), false);
  assert.equal(fs.existsSync(path.join(project, "package-lock.json")), false);
  assert.equal(fs.readFileSync(path.join(project, "bun.lock"), "utf8"), "keep");
  assert.throws(() => manager.rollbackCreatedArtifacts(project, token), /invalide ou expirée/);
});

test("completed rollback guards cannot later delete a successful Android project", (t) => {
  const { project, manager } = projectFixture(t, {
    name: "completed-app",
    scripts: { build: "vite build" },
  });
  const request = {
    appName: "Completed App",
    applicationId: "app.completed.android",
    webDir: "dist",
  };
  const { token } = manager.beginRollbackGuard(project, request);
  fs.mkdirSync(path.join(project, "android"));
  assert.deepEqual(manager.completeRollbackGuard(project, token), { completed: true });
  assert.throws(() => manager.rollbackCreatedArtifacts(project, token), /invalide ou expirée/);
  assert.equal(fs.existsSync(path.join(project, "android")), true);
});
