const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  ARTIFACTS,
  assertUpdateManifest,
  assertX64PortableExecutable,
  validateArtifactInventory,
  validateDesktopOAuth,
} = require("../scripts/verify-win-release.cjs");

test("les artefacts Windows ont des noms compatibles avec un lien permanent", () => {
  assert.deepEqual(ARTIFACTS, [
    "AppPublisher-Setup.exe",
    "AppPublisher-Setup.exe.blockmap",
    "latest.yml",
  ]);
  assert.equal(validateArtifactInventory([...ARTIFACTS, "win-unpacked"]), true);
  assert.throws(() => validateArtifactInventory(["AppPublisher-1.0.0.exe"]), /manquants/);
});

test("le manifeste Windows référence l'installateur stable et son empreinte", () => {
  assert.equal(
    assertUpdateManifest("version: 1.0.0\npath: AppPublisher-Setup.exe\nsha512: abc123\n"),
    true,
  );
  assert.throws(() => assertUpdateManifest("version: 1.0.0\n"), /Setup/);
});

test("le binaire certifié doit être un PE Windows x64", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apppub-pe-"));
  const file = path.join(directory, "AppPublisher.exe");
  const binary = Buffer.alloc(256);
  binary.write("MZ", 0, "ascii");
  binary.writeUInt32LE(128, 0x3c);
  binary.write("PE\0\0", 128, "ascii");
  binary.writeUInt16LE(0x8664, 132);
  fs.writeFileSync(file, binary);
  assert.equal(assertX64PortableExecutable(file), "x64");
  binary.writeUInt16LE(0x014c, 132);
  fs.writeFileSync(file, binary);
  assert.throws(() => assertX64PortableExecutable(file), /x64/);
  fs.rmSync(directory, { recursive: true, force: true });
});

test("le client Google Windows reste un client OAuth de bureau", () => {
  assert.equal(
    validateDesktopOAuth({
      installed: { client_id: "example.apps.googleusercontent.com", client_secret: "secret" },
    }),
    true,
  );
  assert.throws(() => validateDesktopOAuth({ web: {} }), /Application de bureau/);
});
