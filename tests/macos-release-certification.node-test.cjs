const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ARTIFACTS,
  assertUniversalArchitectures,
  assertUpdateManifest,
  validateArtifactInventory,
  validateDesktopOAuth,
} = require("../scripts/verify-mac-release.cjs");

test("la distribution possède des noms stables pour un lien de téléchargement permanent", () => {
  assert.deepEqual(ARTIFACTS, ["AppPublisher.dmg", "AppPublisher.zip", "latest-mac.yml"]);
  assert.equal(validateArtifactInventory([...ARTIFACTS, "mac-universal"]), true);
  assert.throws(() => validateArtifactInventory(["AppPublisher-1.0.0.dmg"]), /manquants/);
});

test("le manifeste de mise à jour référence le ZIP stable et son empreinte", () => {
  assert.equal(
    assertUpdateManifest("version: 1.0.0\npath: AppPublisher.zip\nsha512: abc123\n"),
    true,
  );
  assert.throws(() => assertUpdateManifest("version: 1.0.0\n"), /AppPublisher\.zip/);
});

test("le binaire livré doit être universel Intel et Apple Silicon", () => {
  assert.deepEqual(assertUniversalArchitectures("x86_64 arm64"), ["arm64", "x86_64"]);
  assert.throws(() => assertUniversalArchitectures("arm64"), /x86_64/);
});

test("le client Google embarqué doit rester un client OAuth de bureau", () => {
  assert.equal(
    validateDesktopOAuth({
      installed: { client_id: "example.apps.googleusercontent.com", client_secret: "secret" },
    }),
    true,
  );
  assert.throws(() => validateDesktopOAuth({ web: {} }), /Application de bureau/);
});
