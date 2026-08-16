const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
  assert.equal(config.mac.artifactName, "${productName}.${ext}");
  assert.deepEqual(config.publish, {
    provider: "github",
    owner: "timy971",
    repo: "apppub",
    releaseType: "release",
  });
  assert.match(config.mac.entitlementsInherit, /inherit\.plist$/);
});

test("la release npm certifie les artefacts avant de les publier", () => {
  const fs = require("node:fs");
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/release-macos.yml"), "utf8");
  const releaseScript = fs.readFileSync(path.join(root, "scripts/release-mac.cjs"), "utf8");
  const packScript = fs.readFileSync(path.join(root, "scripts/pack.cjs"), "utf8");

  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /npm run release:mac:publish/);
  assert.doesNotMatch(workflow, /setup-bun|bun install|bun run/);
  assert.ok(
    releaseScript.indexOf("verify-mac-release.cjs") <
      releaseScript.indexOf("publish-mac-release.cjs"),
    "la certification doit précéder la publication",
  );
  assert.match(packScript, /ebArgs\.push\("--publish", "never"\)/);
});
