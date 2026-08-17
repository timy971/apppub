const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WindowsSecretStore } = require("../electron/windows-secret-store.cjs");

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apppub-secrets-"));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value) => value.toString("utf8").replace(/^encrypted:/, ""),
  };
  return {
    directory,
    file: path.join(directory, "windows-secrets.json"),
    store: new WindowsSecretStore({
      file: path.join(directory, "windows-secrets.json"),
      safeStorage,
    }),
  };
}

test("les secrets Windows sont chiffrés au repos, relus et supprimés", () => {
  const { directory, file, store } = fixture();
  assert.equal(store.set("signing", "profile:storepass", "mot-de-passe-secret"), true);
  assert.equal(store.get("signing", "profile:storepass"), "mot-de-passe-secret");
  assert.doesNotMatch(fs.readFileSync(file, "utf8"), /mot-de-passe-secret/);
  assert.equal(store.delete("signing", "profile:storepass"), true);
  assert.equal(store.get("signing", "profile:storepass"), null);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("le stockage refuse toute écriture quand DPAPI est indisponible", () => {
  const { directory, file } = fixture();
  const store = new WindowsSecretStore({
    file,
    safeStorage: { isEncryptionAvailable: () => false },
  });
  assert.equal(store.set("service", "account", "secret"), false);
  assert.equal(store.get("service", "account"), null);
  fs.rmSync(directory, { recursive: true, force: true });
});
