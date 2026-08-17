const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const configPath = path.resolve(__dirname, "..", "electron-builder.config.cjs");

function loadConfig(distribution) {
  const previous = process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  if (distribution) process.env.APPPUBLISHER_WIN_DISTRIBUTION = "1";
  else delete process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  if (previous === undefined) delete process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  else process.env.APPPUBLISHER_WIN_DISTRIBUTION = previous;
  return config;
}

test("le packaging Windows local reste rapide et sans installateur", () => {
  const config = loadConfig(false);
  assert.deepEqual(config.win.target, [{ target: "dir", arch: ["x64"] }]);
});

test("la distribution Windows produit un installateur novice et stable", () => {
  const config = loadConfig(true);
  assert.deepEqual(config.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(config.win.artifactName, "${productName}-Setup.${ext}");
  assert.equal(config.nsis.oneClick, true);
  assert.equal(config.nsis.perMachine, false);
  assert.equal(config.nsis.createDesktopShortcut, false);
  assert.equal(config.nsis.createStartMenuShortcut, true);
  assert.equal(config.nsis.deleteAppDataOnUninstall, false);
  assert.equal(config.forceCodeSigning, true);
  assert.deepEqual(config.publish, {
    provider: "github",
    owner: "timy971",
    repo: "apppub",
    releaseType: "release",
  });
});

test("Microsoft Trusted Signing peut remplacer un certificat PFX", () => {
  const values = {
    WINDOWS_AZURE_PUBLISHER_NAME: "TC Capital",
    WINDOWS_AZURE_ENDPOINT: "https://example.codesigning.azure.net/",
    WINDOWS_AZURE_CERTIFICATE_PROFILE: "AppPublisher",
    WINDOWS_AZURE_SIGNING_ACCOUNT: "tc-capital",
  };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values, { APPPUBLISHER_WIN_DISTRIBUTION: "1" });
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  assert.deepEqual(config.win.azureSignOptions, {
    publisherName: values.WINDOWS_AZURE_PUBLISHER_NAME,
    endpoint: values.WINDOWS_AZURE_ENDPOINT,
    certificateProfileName: values.WINDOWS_AZURE_CERTIFICATE_PROFILE,
    codeSigningAccountName: values.WINDOWS_AZURE_SIGNING_ACCOUNT,
  });
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  delete process.env.APPPUBLISHER_WIN_DISTRIBUTION;
});

test("le workflow Windows certifie avant de publier et n'utilise pas Bun", () => {
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/release-windows.yml"),
    "utf8",
  );
  const release = fs.readFileSync(path.join(root, "scripts/release-win.cjs"), "utf8");
  assert.match(workflow, /runs-on: windows-2025/);
  assert.match(workflow, /npm run release:win:publish/);
  assert.doesNotMatch(workflow, /setup-bun|bun install|bun run/);
  assert.ok(release.indexOf("verify-win-release.cjs") < release.indexOf("publish-win-release.cjs"));
});
