const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const {
  GitProjectManager,
  managedFolderName,
  normalizeRemoteUrl,
  validateBranch,
} = require("../electron/git-projects.cjs");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-git-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const managed = path.join(root, "managed");
  fs.mkdirSync(seed);
  git(root, ["init", "--bare", remote]);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.name", "AppPublisher Tests"]);
  git(seed, ["config", "user.email", "tests@example.invalid"]);
  fs.writeFileSync(path.join(seed, "package.json"), '{"name":"remote-demo"}\n');
  git(seed, ["add", "package.json"]);
  git(seed, ["commit", "-m", "initial"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  const manager = new GitProjectManager(managed, { allowLocalRemotes: true });
  return { manager, managed, remote, seed };
}

test("accepts HTTPS and SSH remotes but refuses embedded HTTPS credentials", () => {
  assert.equal(
    normalizeRemoteUrl("https://GitHub.com/acme/demo.git"),
    "https://github.com/acme/demo.git",
  );
  assert.equal(normalizeRemoteUrl("git@github.com:acme/demo.git"), "git@github.com:acme/demo.git");
  assert.throws(() => normalizeRemoteUrl("https://token@github.com/acme/demo.git"), /jeton/);
  assert.throws(() => normalizeRemoteUrl("file:///tmp/demo.git"), /HTTPS et SSH/);
});

test("validates branch names and creates stable collision-resistant folders", () => {
  assert.equal(validateBranch("feature/import-git"), "feature/import-git");
  assert.throws(() => validateBranch("--upload-pack=bad"), /invalide/);
  assert.throws(() => validateBranch("main..evil"), /invalide/);
  assert.equal(
    managedFolderName("https://github.com/acme/demo.git", "main"),
    managedFolderName("https://github.com/acme/demo.git", "main"),
  );
  assert.notEqual(
    managedFolderName("https://github.com/acme/demo.git", "main"),
    managedFolderName("https://github.com/acme/demo.git", "develop"),
  );
  assert.notEqual(
    managedFolderName("https://github.com/acme/demo.git", "main"),
    managedFolderName("https://gitlab.com/acme/demo.git", "main"),
  );
});

test("clones a selected branch and reports its exact commit", async (t) => {
  const { manager, remote } = fixture(t);
  const remoteUrl = remote;
  const result = await manager.clone({ remoteUrl, branch: "main" });
  assert.equal(result.status.branch, "main");
  assert.equal(result.status.workingTree, "clean");
  assert.match(result.status.headSha, /^[0-9a-f]{40}$/);
  assert.equal(fs.existsSync(path.join(result.localPath, "package.json")), true);
});

test("blocks sync on local changes and fast-forwards a clean copy", async (t) => {
  const { manager, remote, seed } = fixture(t);
  const remoteUrl = remote;
  const cloned = await manager.clone({ remoteUrl, branch: "main" });
  fs.writeFileSync(path.join(cloned.localPath, "local.txt"), "changed\n");
  await assert.rejects(
    manager.sync({ projectPath: cloned.localPath, remoteUrl, branch: "main" }),
    /modifications/,
  );
  fs.unlinkSync(path.join(cloned.localPath, "local.txt"));
  fs.writeFileSync(path.join(seed, "README.md"), "next\n");
  git(seed, ["add", "README.md"]);
  git(seed, ["commit", "-m", "next"]);
  git(seed, ["push"]);
  const synced = await manager.sync({ projectPath: cloned.localPath, remoteUrl, branch: "main" });
  assert.equal(synced.updated, true);
  assert.equal(synced.status.relation, "up-to-date");
  assert.equal(fs.existsSync(path.join(cloned.localPath, "README.md")), true);
});

test("checks the remote and reports an available update without changing files", async (t) => {
  const { manager, remote, seed } = fixture(t);
  const cloned = await manager.clone({ remoteUrl: remote, branch: "main" });
  const initialHead = cloned.status.headSha;
  fs.writeFileSync(path.join(seed, "REMOTE.md"), "available\n");
  git(seed, ["add", "REMOTE.md"]);
  git(seed, ["commit", "-m", "remote update"]);
  git(seed, ["push"]);

  const checked = await manager.check({
    projectPath: cloned.localPath,
    remoteUrl: remote,
    branch: "main",
  });
  assert.equal(checked.relation, "behind");
  assert.equal(checked.headSha, initialHead);
  assert.equal(fs.existsSync(path.join(cloned.localPath, "REMOTE.md")), false);
});

test("refuses Git operations outside the managed projects directory", async (t) => {
  const { manager, seed } = fixture(t);
  await assert.rejects(manager.status({ projectPath: seed }), /géré par AppPublisher/);
});

function advance(seed, file = "REMOTE.md") {
  fs.writeFileSync(path.join(seed, file), "remote update\n");
  git(seed, ["add", file]);
  git(seed, ["commit", "-m", "advance remote"]);
  git(seed, ["push"]);
  return git(seed, ["rev-parse", "HEAD"]);
}

test("internal backups do not dirty a project or hide real changes beyond 50 files", async (t) => {
  const { manager, remote, seed } = fixture(t);
  const { localPath } = await manager.clone({ remoteUrl: remote, branch: "main" });
  const backups = path.join(localPath, ".apppublisher-backups");
  fs.mkdirSync(backups);
  for (let i = 0; i < 70; i++) fs.writeFileSync(path.join(backups, `${i}.txt`), "backup");
  const args = { projectPath: localPath, remoteUrl: remote, branch: "main" };
  const status = await manager.status(args);
  assert.equal(status.workingTree, "clean");
  assert.equal(status.ignoredBackupFiles, 70);
  advance(seed);
  assert.equal((await manager.sync(args)).status.relation, "up-to-date");
  assert.equal(fs.readFileSync(path.join(backups, "0.txt"), "utf8"), "backup");
  for (let i = 0; i < 60; i++) fs.writeFileSync(path.join(localPath, `source-${i}.txt`), "manual");
  const dirty = await manager.status(args);
  assert.equal(dirty.changedFiles.length, 60);
  await assert.rejects(manager.sync(args), /modifications/);
});

test("save-and-sync preserves tracked, staged and untracked work without replaying old files", async (t) => {
  const { manager, remote, seed } = fixture(t);
  const { localPath } = await manager.clone({ remoteUrl: remote, branch: "main" });
  fs.writeFileSync(path.join(localPath, "package.json"), '{"version":"1.2.0"}\n');
  git(localPath, ["add", "package.json"]);
  fs.writeFileSync(path.join(localPath, "notes.txt"), "user work\n");
  fs.mkdirSync(path.join(localPath, ".apppublisher-backups"));
  fs.writeFileSync(path.join(localPath, ".apppublisher-backups/old.txt"), "old backup\n");
  const target = advance(seed, "package.json");
  const synced = await manager.sync({
    projectPath: localPath,
    remoteUrl: remote,
    branch: "main",
    backupLocalChanges: true,
  });
  assert.equal(synced.status.headSha, target);
  assert.equal(synced.status.workingTree, "clean");
  assert.match(synced.backupRef, /^refs\/apppublisher\/sync-backups\//);
  assert.equal(git(localPath, ["show", `${synced.backupRef}:package.json`]), '{"version":"1.2.0"}');
  assert.equal(git(localPath, ["show", `${synced.backupRef}^3:notes.txt`]), "user work");
  assert.equal(
    fs.readFileSync(path.join(localPath, ".apppublisher-backups/old.txt"), "utf8"),
    "old backup\n",
  );
  assert.equal(fs.readFileSync(path.join(localPath, "package.json"), "utf8"), "remote update\n");
  assert.equal(fs.existsSync(path.join(localPath, "notes.txt")), false);
  git(localPath, ["stash", "drop"]);
  assert.equal(git(localPath, ["show", `${synced.backupRef}:package.json`]), '{"version":"1.2.0"}');
});

test("network failure leaves local work intact before any stash", async (t) => {
  const { manager, remote } = fixture(t);
  const { localPath } = await manager.clone({ remoteUrl: remote, branch: "main" });
  fs.writeFileSync(path.join(localPath, "notes.txt"), "user work\n");
  const run = manager.runChecked.bind(manager);
  manager.runChecked = (args, opts) =>
    args[0] === "fetch" ? Promise.reject(new Error("offline")) : run(args, opts);
  await assert.rejects(
    manager.sync({
      projectPath: localPath,
      remoteUrl: remote,
      branch: "main",
      backupLocalChanges: true,
    }),
    /offline/,
  );
  assert.equal(fs.readFileSync(path.join(localPath, "notes.txt"), "utf8"), "user work\n");
  assert.equal(git(localPath, ["stash", "list"]), "");
});

test("merge failure reports the saved ref and never reapplies old changes", async (t) => {
  const { manager, remote, seed } = fixture(t);
  const { localPath, status } = await manager.clone({ remoteUrl: remote, branch: "main" });
  fs.writeFileSync(path.join(localPath, "notes.txt"), "user work\n");
  advance(seed);
  const run = manager.runChecked.bind(manager);
  manager.runChecked = (args, opts) =>
    args[0] === "merge" ? Promise.reject(new Error("merge failed")) : run(args, opts);
  let saved;
  await assert.rejects(
    manager.sync({
      projectPath: localPath,
      remoteUrl: remote,
      branch: "main",
      backupLocalChanges: true,
    }),
    (error) => {
      saved = error.message.match(/refs\/apppublisher\/sync-backups\/[\w-]+/)?.[0];
      return Boolean(saved);
    },
  );
  assert.equal(git(localPath, ["show", `${saved}^3:notes.txt`]), "user work");
  assert.equal(git(localPath, ["rev-parse", "HEAD"]), status.headSha);
  assert.equal(fs.existsSync(path.join(localPath, "notes.txt")), false);
});

test("unpublished commits block save-and-sync without touching local work", async (t) => {
  const { manager, remote } = fixture(t);
  const { localPath } = await manager.clone({ remoteUrl: remote, branch: "main" });
  git(localPath, ["config", "user.email", "test@example.invalid"]);
  git(localPath, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(localPath, "commit.txt"), "local");
  git(localPath, ["add", "commit.txt"]);
  git(localPath, ["commit", "-m", "local work"]);
  fs.writeFileSync(path.join(localPath, "notes.txt"), "keep me");
  await assert.rejects(
    manager.sync({
      projectPath: localPath,
      remoteUrl: remote,
      branch: "main",
      backupLocalChanges: true,
    }),
    /commits non publiés/,
  );
  assert.equal(fs.readFileSync(path.join(localPath, "notes.txt"), "utf8"), "keep me");
  assert.equal(git(localPath, ["stash", "list"]), "");
});
