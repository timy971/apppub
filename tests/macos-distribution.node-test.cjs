const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const configPath = path.resolve(__dirname, "..", "electron-builder.config.cjs");

function loadConfig(distribution) {
  const previous = process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  if (distribution) process.env.APPPUBLISHER_MAC_DISTRIBUTION = "1";
  else delete process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  if (previous === undefined) delete process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  else process.env.APPPUBLISHER_MAC_DISTRIBUTION = previous;
  return config;
}

test("le packaging local reste une application arm64 non signée", () => {
  const config = loadConfig(false);
  assert.deepEqual(config.mac.target, [{ target: "dir", arch: ["arm64"] }]);
  assert.equal(config.mac.identity, null);
  assert.equal(config.mac.hardenedRuntime, false);
});

test("la distribution macOS est universelle, signée, notarisée et publiable", () => {
  const config = loadConfig(true);
  assert.deepEqual(config.mac.target, [
    { target: "dmg", arch: ["universal"] },
    { target: "zip", arch: ["universal"] },
  ]);
  assert.equal(config.mac.identity, undefined);
  assert.equal(config.mac.hardenedRuntime, true);
  assert.equal(config.mac.notarize, true);
  assert.deepEqual(config.publish, {
    provider: "github",
    owner: "timy971",
    repo: "apppub",
    releaseType: "release",
  });
  assert.match(config.mac.entitlementsInherit, /inherit\.plist$/);
});


test("le packaging prépare et embarque bundletool quand le JAR vérifié est présent", () => {
  const pack = fs.readFileSync(path.resolve(__dirname, "..", "scripts", "pack.cjs"), "utf8");
  const builder = fs.readFileSync(configPath, "utf8");
  const ensure = fs.readFileSync(
    path.resolve(__dirname, "..", "scripts", "ensure-bundletool.cjs"),
    "utf8",
  );

  assert.match(pack, /ensure-bundletool\.cjs/);
  assert.match(builder, /build\/tools\/bundletool\.jar/);
  assert.match(builder, /tools\/bundletool\.jar/);
  assert.match(ensure, /1\.18\.2/);
  assert.match(ensure, /Téléchargement automatique de bundletool/);
  assert.match(
    ensure,
    /github\.com\/google\/bundletool\/releases\/download\/1\.18\.2\/bundletool-all-1\.18\.2\.jar/,
  );
  assert.match(
    ensure,
    /378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584/,
  );
});
