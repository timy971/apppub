/**
 * Certification du paquet réellement remis à l'utilisateur.
 * Aucun identifiant ou secret n'est écrit dans le rapport.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARTIFACTS = Object.freeze(["AppPublisher.dmg", "AppPublisher.zip", "latest-mac.yml"]);

function validateArtifactInventory(names) {
  const missing = ARTIFACTS.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Artefacts manquants : ${missing.join(", ")}`);
  return true;
}

function assertUpdateManifest(content) {
  if (!/^version:\s*\S+/m.test(content)) throw new Error("Version absente de latest-mac.yml.");
  if (!/(?:url|path):\s*AppPublisher\.zip\b/m.test(content)) {
    throw new Error("Le manifeste de mise à jour ne référence pas AppPublisher.zip.");
  }
  if (!/sha512:\s*\S+/m.test(content)) throw new Error("Empreinte absente de latest-mac.yml.");
  return true;
}

function assertUniversalArchitectures(output) {
  const architectures = new Set(String(output).trim().split(/\s+/).filter(Boolean));
  for (const required of ["arm64", "x86_64"]) {
    if (!architectures.has(required)) throw new Error(`Architecture macOS absente : ${required}`);
  }
  return [...architectures].sort();
}

function validateDesktopOAuth(source) {
  const client = source?.installed ?? source;
  if (!client?.client_id?.endsWith(".apps.googleusercontent.com") || !client?.client_secret) {
    throw new Error("Le client OAuth Google intégré n'est pas une Application de bureau valide.");
  }
  return true;
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim().split(/\r?\n/).at(-1);
    throw new Error(`${path.basename(command)} a refusé le paquet${detail ? ` : ${detail}` : ""}`);
  }
  return String(result.stdout || result.stderr || "").trim();
}

function certify(options = {}) {
  if ((options.platform ?? process.platform) !== "darwin") {
    throw new Error("La certification de distribution doit être exécutée sur macOS.");
  }
  const root = options.root ?? path.resolve(__dirname, "..");
  const output = path.join(root, "dist-app");
  const names = fs.readdirSync(output);
  validateArtifactInventory(names);
  assertUpdateManifest(fs.readFileSync(path.join(output, "latest-mac.yml"), "utf8"));

  const appPath = path.join(output, "mac-universal", "AppPublisher.app");
  if (!fs.existsSync(appPath)) throw new Error("Application universelle absente du packaging.");
  const executable = path.join(appPath, "Contents", "MacOS", "AppPublisher");
  const oauth = path.join(appPath, "Contents", "Resources", "google-play-oauth.json");
  if (!fs.existsSync(oauth)) throw new Error("Client OAuth Google absent de l'application livrée.");
  validateDesktopOAuth(JSON.parse(fs.readFileSync(oauth, "utf8")));

  const architectures = assertUniversalArchitectures(run("/usr/bin/lipo", ["-archs", executable]));
  run("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  run("/usr/sbin/spctl", ["--assess", "--type", "execute", "--verbose=2", appPath]);
  run("/usr/bin/xcrun", ["stapler", "validate", appPath]);

  const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;
  const artifacts = ARTIFACTS.map((name) => {
    const file = path.join(output, name);
    return { name, bytes: fs.statSync(file).size, sha256: sha256(file) };
  });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    version,
    verdict: "ready",
    architectures,
    checks: {
      developerIdSignature: "passed",
      gatekeeper: "passed",
      notarizationTicket: "passed",
      googleDesktopOAuth: "passed",
      updateManifest: "passed",
    },
    artifacts,
  };
  const reportDir = path.join(root, ".artifacts");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, "macos-release-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  return report;
}

if (require.main === module) {
  try {
    const report = certify();
    console.log(`✓ AppPublisher ${report.version} est signé, notarisé et prêt à télécharger.`);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  ARTIFACTS,
  assertUniversalArchitectures,
  assertUpdateManifest,
  certify,
  validateArtifactInventory,
  validateDesktopOAuth,
};
