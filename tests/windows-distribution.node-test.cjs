const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const configPath = path.resolve(__dirname, "..", "electron-builder.config.cjs");

function loadConfig(mode = "local") {
  const previousDistribution = process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  const previousPrivateBeta = process.env.APPPUBLISHER_WIN_PRIVATE_BETA;
  delete process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  delete process.env.APPPUBLISHER_WIN_PRIVATE_BETA;
  if (mode === "public") process.env.APPPUBLISHER_WIN_DISTRIBUTION = "1";
  if (mode === "private-beta") process.env.APPPUBLISHER_WIN_PRIVATE_BETA = "1";
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  if (previousDistribution === undefined) delete process.env.APPPUBLISHER_WIN_DISTRIBUTION;
  else process.env.APPPUBLISHER_WIN_DISTRIBUTION = previousDistribution;
  if (previousPrivateBeta === undefined) delete process.env.APPPUBLISHER_WIN_PRIVATE_BETA;
  else process.env.APPPUBLISHER_WIN_PRIVATE_BETA = previousPrivateBeta;
  return config;
}

test("le packaging Windows local reste rapide et sans installateur", () => {
  const config = loadConfig("local");
  assert.deepEqual(config.win.target, [{ target: "dir", arch: ["x64"] }]);
  assert.equal(config.forceCodeSigning, false);
});

test("la bêta privée produit le vrai installateur NSIS sans certificat payant", () => {
  const config = loadConfig("private-beta");
  assert.deepEqual(config.win.target, [{ target: "nsis", arch: ["x64"] }]);
  assert.equal(config.win.artifactName, "${productName}-Setup.${ext}");
  assert.equal(config.forceCodeSigning, false);
  assert.equal(config.win.azureSignOptions, undefined);
  assert.equal(config.publish, null);
});

test("la distribution Windows publique produit le même installateur avec signature obligatoire", () => {
  const config = loadConfig("public");
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

test("Microsoft Trusted Signing peut remplacer un certificat PFX pour la distribution publique", () => {
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

test("le workflow Windows utilise les dépendances certifiées avant de publier", () => {
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/release-windows.yml"),
    "utf8",
  );
  const release = fs.readFileSync(path.join(root, "scripts/release-win.cjs"), "utf8");
  assert.match(workflow, /runs-on: windows-2025/);
  assert.match(workflow, /oven-sh\/setup-bun@/);
  assert.match(workflow, /bun install --frozen-lockfile/);
  assert.match(workflow, /node scripts\/certify-release-candidate\.cjs/);
  assert.match(workflow, /bun run release:win:publish/);
  assert.doesNotMatch(workflow, /npm install --no-package-lock/);
  assert.ok(release.indexOf("verify-win-release.cjs") < release.indexOf("publish-win-release.cjs"));
});

test("la release candidate exécute une vraie recette Windows machine neuve", () => {
  const root = path.resolve(__dirname, "..");
  const workflow = fs.readFileSync(
    path.join(root, ".github/workflows/release-candidate.yml"),
    "utf8",
  );
  const recipe = fs.readFileSync(path.join(root, "scripts/smoke-win-clean-install.ps1"), "utf8");

  assert.match(workflow, /Clean-machine private beta — Windows/);
  assert.match(workflow, /smoke-win-clean-install\.ps1/);
  assert.match(workflow, /windows-clean-machine-smoke\.json/);
  assert.match(recipe, /Installation silencieuse sans élévation/);
  assert.match(recipe, /Raccourci menu Démarrer créé/);
  assert.match(recipe, /Données utilisateur conservées/);
  assert.match(recipe, /Réinstallation enregistrée/);
  assert.match(recipe, /Get-AuthenticodeSignature/);
});
