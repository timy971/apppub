const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { GooglePlayResumeStore, MAX_AGE_MS } = require("../electron/google-play-resume-store.cjs");

function fixture(t, now = 1_700_000_000_000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-gplay-resume-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    store: new GooglePlayResumeStore(path.join(root, "resume.json"), { now: () => now }),
    root,
  };
}

function checkpoint(overrides = {}) {
  return {
    connectionId: "gplay_123",
    packageName: "app.cranioscan.android",
    artifactSha256: "A".repeat(64),
    versionCode: 42,
    editId: "edit-42",
    phase: "bundle-uploaded",
    ...overrides,
  };
}

test("persists and reloads a resume checkpoint bound to project, account and artifact", (t) => {
  const { store } = fixture(t);
  store.save("project-1", checkpoint());
  const loaded = store.get("project-1", {
    connectionId: "gplay_123",
    packageName: "app.cranioscan.android",
    artifactSha256: "a".repeat(64),
    versionCode: 42,
  });
  assert.equal(loaded.editId, "edit-42");
  assert.equal(loaded.phase, "bundle-uploaded");
});

test("clears a checkpoint when the artifact binding changes", (t) => {
  const { store } = fixture(t);
  store.save("project-1", checkpoint());
  assert.equal(
    store.get("project-1", { artifactSha256: "B".repeat(64) }),
    null,
  );
  assert.equal(store.get("project-1"), null);
});

test("expires stale checkpoints instead of resuming an old Google edit", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-gplay-resume-expired-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let now = 1_700_000_000_000;
  const store = new GooglePlayResumeStore(path.join(root, "resume.json"), { now: () => now });
  store.save("project-1", checkpoint());
  now += MAX_AGE_MS + 1;
  assert.equal(store.get("project-1"), null);
});

test("startup pruning removes checkpoints for missing or changed projects", (t) => {
  const { store } = fixture(t);
  store.save("project-1", checkpoint());
  store.save(
    "project-2",
    checkpoint({
      connectionId: "gplay_other",
      packageName: "app.other.android",
      editId: "edit-other",
    }),
  );

  const result = store.prune([
    {
      projectId: "project-1",
      connectionId: "gplay_123",
      packageName: "app.cranioscan.android",
    },
    {
      projectId: "project-2",
      connectionId: "gplay_changed",
      packageName: "app.other.android",
    },
  ]);

  assert.deepEqual(result.removed, ["project-2"]);
  assert.deepEqual(result.kept, ["project-1"]);
  assert.equal(store.get("project-1")?.editId, "edit-42");
  assert.equal(store.get("project-2"), null);
});

test("startup pruning removes checkpoints for projects that no longer exist", (t) => {
  const { store } = fixture(t);
  store.save("project-1", checkpoint());

  const result = store.prune([]);

  assert.deepEqual(result.removed, ["project-1"]);
  assert.equal(store.get("project-1"), null);
});

test("keeps commit-unknown as a resumable checkpoint", (t) => {
  const { store } = fixture(t);
  store.save("project-1", checkpoint({ phase: "commit-unknown" }));
  assert.equal(store.get("project-1").phase, "commit-unknown");
});
