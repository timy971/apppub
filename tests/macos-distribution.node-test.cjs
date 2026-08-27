const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const configPath = path.resolve(__dirname, "..", "electron-builder.config.cjs");

function loadConfig(mode = "local") {
  const previousDistribution = process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  const previousPrivateBeta = process.env.APPPUBLISHER_MAC_PRIVATE_BETA;
  delete process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  delete process.env.APPPUBLISHER_MAC_PRIVATE_BETA;
  if (mode === "public") process.env.APPPUBLISHER_MAC_DISTRIBUTION = "1";
  if (mode === "private-beta") process.env.APPPUBLISHER_MAC_PRIVATE_BETA = "1";
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  if (previousDistribution === undefined) delete process.env.APPPUBLISHER_MAC_DISTRIBUTION;
  else process.env.APPPUBLISHER_MAC_DISTRIBUTION = previousDistribution;
  if (previousPrivateBeta === undefined) delete process.env.APPPUBLISHER_MAC_PRIVATE_BETA;
  else process.env.APPPUBLISHER_MAC_PRIVATE_BETA = previousPrivateBeta;
  return config;
}

test("le packaging local reste une application arm64 non signée", () => {
  const config = loadConfig("local");
  assert.deepEqual(config.mac.target, [{ target: "dir", arch: ["arm64"] }]);
  assert.equal(config.mac.identity, null);
  assert.equal(config.mac.hardenedRuntime, false);
});

test("la bêta privée macOS produit deux DMG natifs sans certificat Apple", () => {
  const config = loadConfig("private-beta");
  assert.deepEqual(config.mac.target, [{ target: "dmg", arch: ["arm64", "x64"] }]);
  assert.equal(config.mac.identity, null);
  assert.equal(config.mac.hardenedRuntime, false);
  assert.equal(config.mac.notarize, false);
  assert.equal(config.mac.artifactName, "${productName}-${arch}.${ext}");
  assert.equal(config.publish, null);
});

test("la distribution macOS publique reste universelle, signée, notarisée et publiable", () => {
  const config = loadConfig("public");
  assert.deepEqual(config.mac.target, [
    { target: "dmg", arch: ["universal"] },
    { target: "zip", arch: ["universal"] },
  ]);
  assert.equal(config.mac.identity, undefined);
  assert.equal(config.mac.hardenedRuntime, true);
  assert.equal(config.mac.notarize, true);
  assert.equal(config.mac.artifactName, "${productName}.${ext}");
  assert.deepEqual(config.publish, {
    provider: "github",
    owner: "timy971",
    repo: "apppub",
    releaseType: "release",
  });
  assert.match(config.mac.entitlementsInherit, /inherit\.plist$/);
});

test("la release macOS utilise les dépendances certifiées avant de publier", () => {
  const fs = require("node:fs");
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-macos.yml"), "utf8");
  const releaseScript = fs.readFileSync(path.join(root, "scripts/release-mac.cjs"), "utf8");
  const packScript = fs.readFileSync(path.join(root, "scripts/pack.cjs"), "utf8");

  assert.match(workflow, /oven-sh\/setup-bun@/);
  assert.match(workflow, /bun install --frozen-lockfile/);
  assert.match(workflow, /node scripts\/certify-release-candidate\.cjs/);
  assert.match(workflow, /bun run release:mac:publish/);
  assert.doesNotMatch(workflow, /npm install --no-package-lock/);
  assert.ok(
    releaseScript.indexOf("verify-mac-release.cjs") <
      releaseScript.indexOf("publish-mac-release.cjs"),
    "la certification doit précéder la publication",
  );
  assert.match(packScript, /mac-beta/);
  assert.match(packScript, /AppPublisher-arm64\.dmg/);
  assert.match(packScript, /AppPublisher-x64\.dmg/);
  assert.match(packScript, /ebArgs\.push\("--publish", "never"\)/);
});
