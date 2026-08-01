const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { DurableStore } = require("../electron/durable-store.cjs");

test("persists typed application data atomically across restarts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "data", "store.json");
  const first = new DurableStore(filePath);
  assert.deepEqual(first.set("settings", { language: "fr" }), { ok: true });
  assert.equal(fs.existsSync(`${filePath}.bak`), true);
  assert.deepEqual(
    first.set("projects", [
      {
        id: "one",
        name: "Demo",
        localPath: "/tmp/project",
        currentVersion: "1.0.0",
        currentBuild: 1,
        detected: {},
      },
    ]),
    { ok: true },
  );

  const second = new DurableStore(filePath);
  assert.deepEqual(second.get("settings"), {
    ok: true,
    found: true,
    value: { language: "fr" },
  });
  assert.equal(second.get("unknown").ok, false);
});

test("does not replace valid data when its safety copy cannot be written", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-store-backup-failure-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "store.json");
  let failBackup = false;
  const guardedFs = new Proxy(fs, {
    get(target, property) {
      if (property !== "renameSync") return target[property];
      return (source, destination) => {
        if (failBackup && destination === `${filePath}.bak`) {
          throw new Error("simulated backup failure");
        }
        return target.renameSync(source, destination);
      };
    },
  });
  const store = new DurableStore(filePath, { fsModule: guardedFs });
  assert.deepEqual(store.set("settings", { language: "fr" }), { ok: true });
  failBackup = true;
  assert.equal(store.set("settings", { language: "en" }).ok, false);

  const unchanged = new DurableStore(filePath);
  assert.deepEqual(unchanged.get("settings").value, { language: "fr" });
});

test("recovers the last valid document from the automatic backup", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-recover-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, "store.json");
  const store = new DurableStore(filePath);
  store.set("settings", { language: "fr" });
  store.set("settings", { language: "en" });
  fs.writeFileSync(filePath, "{broken json");

  const recovered = new DurableStore(filePath);
  assert.deepEqual(recovered.get("settings").value, { language: "fr" });
  assert.equal(recovered.status().ok, false);
  assert.match(recovered.status().lastError, /récupérées depuis la sauvegarde/);
});

test("refuses prototypes, cycles and oversized documents", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-invalid-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new DurableStore(path.join(root, "store.json"), { maxBytes: 300 });
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(store.set("settings", cyclic).ok, false);
  assert.equal(store.set("settings", { payload: "x".repeat(500) }).ok, false);
  assert.equal(store.set("projects", "not-an-array").ok, false);
  assert.equal(
    store.set("android-signing.profiles.v1", [
      {
        id: "profile-1",
        name: "Release",
        keystorePath: "/tmp/release.jks",
        alias: "release",
        storepass: "must-not-be-imported",
      },
    ]).ok,
    false,
  );
});
