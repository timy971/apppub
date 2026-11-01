const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { GitProjectManager } = require("../electron/git-projects.cjs");
const {
  PublicationWorkspaceManager,
} = require("../electron/publication-workspaces.cjs");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-workspace-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git");
  const seed = path.join(root, "seed");
  const managed = path.join(root, "managed");
  const workspaces = path.join(root, "publication-workspaces");

  fs.mkdirSync(seed);
  git(root, ["init", "--bare", remote]);
  git(seed, ["init", "-b", "main"]);
  git(seed, ["config", "user.name", "AppPublisher Tests"]);
  git(seed, ["config", "user.email", "tests@example.invalid"]);
  fs.writeFileSync(path.join(seed, "package.json"), '{"name":"source-v1"}\n');
  git(seed, ["add", "package.json"]);
  git(seed, ["commit", "-m", "initial"]);
  git(seed, ["remote", "add", "origin", remote]);
  git(seed, ["push", "-u", "origin", "main"]);
  git(remote, ["symbolic-ref", "HEAD", "refs/heads/main"]);

  const gitManager = new GitProjectManager(managed, { allowLocalRemotes: true });
  const workspaceManager = new PublicationWorkspaceManager(workspaces, gitManager, {
    now: () => 1_700_000_000_000,
    randomBytes: () => Buffer.from("01020304", "hex"),
  });
  return { root, remote, seed, managed, workspaces, gitManager, workspaceManager };
}

test("publishes a clean remote snapshot even when the managed clone is dirty and stale", async (t) => {
  const { remote, seed, gitManager, workspaceManager } = fixture(t);
  const cloned = await gitManager.clone({ remoteUrl: remote, branch: "main" });

  fs.writeFileSync(path.join(cloned.localPath, "package.json"), '{"name":"local-dirty"}\n');
  fs.writeFileSync(path.join(cloned.localPath, "generated-local.txt"), "must never publish\n");

  fs.writeFileSync(path.join(seed, "package.json"), '{"name":"source-v2"}\n');
  fs.writeFileSync(path.join(seed, "REMOTE.md"), "remote-only\n");
  git(seed, ["add", "package.json", "REMOTE.md"]);
  git(seed, ["commit", "-m", "remote v2"]);
  git(seed, ["push"]);

  const remoteSha = git(seed, ["rev-parse", "HEAD"]);
  const prepared = await workspaceManager.prepare({
    projectPath: cloned.localPath,
    remoteUrl: remote,
    branch: "main",
  });

  assert.equal(prepared.sourceSha, remoteSha);
  assert.equal(prepared.sourceWorkingTree, "dirty");
  assert.equal(git(prepared.workspacePath, ["rev-parse", "HEAD"]), remoteSha);
  assert.equal(git(prepared.workspacePath, ["status", "--porcelain"]), "");
  assert.equal(
    fs.readFileSync(path.join(prepared.workspacePath, "package.json"), "utf8"),
    '{"name":"source-v2"}\n',
  );
  assert.equal(fs.existsSync(path.join(prepared.workspacePath, "REMOTE.md")), true);
  assert.equal(fs.existsSync(path.join(prepared.workspacePath, "generated-local.txt")), false);

  // Le clone géré reste intact : AppPublisher n'a pas "réparé" la source en
  // supprimant les fichiers de l'utilisateur.
  assert.equal(
    fs.readFileSync(path.join(cloned.localPath, "package.json"), "utf8"),
    '{"name":"local-dirty"}\n',
  );
  assert.equal(fs.existsSync(path.join(cloned.localPath, "generated-local.txt")), true);
});

test("releasing a publication workspace removes only the disposable worktree", async (t) => {
  const { remote, gitManager, workspaceManager } = fixture(t);
  const cloned = await gitManager.clone({ remoteUrl: remote, branch: "main" });
  const prepared = await workspaceManager.prepare({
    projectPath: cloned.localPath,
    remoteUrl: remote,
    branch: "main",
  });
  fs.writeFileSync(path.join(prepared.workspacePath, "build-output.txt"), "temporary\n");

  const released = await workspaceManager.release({
    projectPath: cloned.localPath,
    workspacePath: prepared.workspacePath,
  });

  assert.equal(released.released, true);
  assert.equal(fs.existsSync(prepared.workspacePath), false);
  assert.equal(fs.existsSync(cloned.localPath), true);
  assert.equal(fs.existsSync(path.join(cloned.localPath, "package.json")), true);
});

test("startup cleanup recovers the managed Git owner and leaves unknown folders intact", async (t) => {
  const { remote, gitManager, workspaceManager, workspaces } = fixture(t);
  const cloned = await gitManager.clone({ remoteUrl: remote, branch: "main" });
  const prepared = await workspaceManager.prepare({
    projectPath: cloned.localPath,
    remoteUrl: remote,
    branch: "main",
  });
  const unknown = path.join(workspaces, "unknown-folder");
  fs.mkdirSync(unknown);
  fs.writeFileSync(path.join(unknown, "keep.txt"), "do-not-delete\n");

  const result = await workspaceManager.cleanupOrphans([]);

  assert.deepEqual(result.removed, [prepared.workspacePath]);
  assert.equal(result.skipped.includes(unknown), true);
  assert.equal(fs.existsSync(prepared.workspacePath), false);
  assert.equal(fs.existsSync(unknown), true);
  assert.equal(fs.existsSync(cloned.localPath), true);
});

test("a workspace cannot be released through another managed repository", async (t) => {
  const first = fixture(t);
  const secondRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-workspace-other-"));
  t.after(() => fs.rmSync(secondRoot, { recursive: true, force: true }));

  const firstClone = await first.gitManager.clone({ remoteUrl: first.remote, branch: "main" });
  const prepared = await first.workspaceManager.prepare({
    projectPath: firstClone.localPath,
    remoteUrl: first.remote,
    branch: "main",
  });

  const otherRemote = path.join(secondRoot, "remote.git");
  const otherSeed = path.join(secondRoot, "seed");
  fs.mkdirSync(otherSeed);
  git(secondRoot, ["init", "--bare", otherRemote]);
  git(otherSeed, ["init", "-b", "main"]);
  git(otherSeed, ["config", "user.name", "AppPublisher Tests"]);
  git(otherSeed, ["config", "user.email", "tests@example.invalid"]);
  fs.writeFileSync(path.join(otherSeed, "README.md"), "other\n");
  git(otherSeed, ["add", "README.md"]);
  git(otherSeed, ["commit", "-m", "initial"]);
  git(otherSeed, ["remote", "add", "origin", otherRemote]);
  git(otherSeed, ["push", "-u", "origin", "main"]);
  git(otherRemote, ["symbolic-ref", "HEAD", "refs/heads/main"]);

  const otherClone = await first.gitManager.clone({ remoteUrl: otherRemote, branch: "main" });

  await assert.rejects(
    first.workspaceManager.release({
      projectPath: otherClone.localPath,
      workspacePath: prepared.workspacePath,
    }),
    /n’appartient pas au projet source attendu/,
  );
  assert.equal(fs.existsSync(prepared.workspacePath), true);
});


test("removes only an incomplete Android copy from the disposable workspace", async (t) => {
  const { remote, seed, gitManager, workspaceManager } = fixture(t);

  fs.mkdirSync(path.join(seed, "android", "app"), { recursive: true });
  fs.writeFileSync(path.join(seed, "android", "README.txt"), "incomplete android\n");
  git(seed, ["add", "android"]);
  git(seed, ["commit", "-m", "add incomplete android"]);
  git(seed, ["push"]);

  const cloned = await gitManager.clone({ remoteUrl: remote, branch: "main" });
  const sourceAndroid = path.join(cloned.localPath, "android");
  assert.equal(fs.existsSync(sourceAndroid), true);

  const prepared = await workspaceManager.prepare({
    projectPath: cloned.localPath,
    remoteUrl: remote,
    branch: "main",
  });

  assert.equal(
    fs.existsSync(path.join(prepared.workspacePath, "android")),
    false,
    "la copie Android incomplète doit être retirée du workspace",
  );
  assert.equal(
    fs.existsSync(sourceAndroid),
    true,
    "le clone géré source ne doit jamais être modifié",
  );
});
