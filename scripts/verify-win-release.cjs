/** Certification du paquet Windows réellement remis à l'utilisateur. */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ARTIFACTS = Object.freeze([
  "AppPublisher-Setup.exe",
  "AppPublisher-Setup.exe.blockmap",
  "latest.yml",
]);

function validateArtifactInventory(names) {
  const missing = ARTIFACTS.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Artefacts manquants : ${missing.join(", ")}`);
  return true;
}

function assertUpdateManifest(content) {
  if (!/^version:\s*\S+/m.test(content)) throw new Error("Version absente de latest.yml.");
  if (!/(?:url|path):\s*AppPublisher-Setup\.exe\b/m.test(content)) {
    throw new Error("Le manifeste ne référence pas AppPublisher-Setup.exe.");
  }
  if (!/sha512:\s*\S+/m.test(content)) throw new Error("Empreinte absente de latest.yml.");
  return true;
}

function assertX64PortableExecutable(file) {
  const data = fs.readFileSync(file);
  if (data.length < 64 || data.toString("ascii", 0, 2) !== "MZ") {
    throw new Error("Le binaire Windows n'est pas un exécutable PE valide.");
  }
  const peOffset = data.readUInt32LE(0x3c);
  if (peOffset + 6 > data.length || data.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error("La signature PE du binaire Windows est invalide.");
  }
  const machine = data.readUInt16LE(peOffset + 4);
  if (machine !== 0x8664) throw new Error("Le binaire livré n'est pas compatible Windows x64.");
  return "x64";
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

function verifyAuthenticode(file) {
  const command = [
    "$signature = Get-AuthenticodeSignature -LiteralPath $args[0]",
    "$result = [pscustomobject]@{ Status = $signature.Status.ToString(); Subject = $signature.SignerCertificate.Subject; Thumbprint = $signature.SignerCertificate.Thumbprint }",
    "$result | ConvertTo-Json -Compress",
  ].join("; ");
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command, file],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error("PowerShell n'a pas pu vérifier la signature Windows.");
  const signature = JSON.parse(String(result.stdout).trim());
  if (signature.Status !== "Valid" || !signature.Subject || !signature.Thumbprint) {
    throw new Error(`Signature Windows refusée : ${signature.Status || "absente"}.`);
  }
  return signature;
}

function silentInstallSmokeTest(installer, expectedInstallDir) {
  const installedExe = path.join(expectedInstallDir, "AppPublisher.exe");
  const uninstallExe = path.join(expectedInstallDir, "Uninstall AppPublisher.exe");
  const install = spawnSync(installer, ["/S"], { encoding: "utf8", timeout: 180_000 });
  if (install.status !== 0 || !fs.existsSync(installedExe)) {
    throw new Error("L'installateur silencieux n'a pas installé AppPublisher correctement.");
  }
  verifyAuthenticode(installedExe);
  if (fs.existsSync(uninstallExe)) {
    const uninstall = spawnSync(uninstallExe, ["/S"], { encoding: "utf8", timeout: 180_000 });
    if (uninstall.status !== 0) throw new Error("La désinstallation silencieuse a échoué.");
  }
  return true;
}

function certify(options = {}) {
  if ((options.platform ?? process.platform) !== "win32") {
    throw new Error("La certification de distribution doit être exécutée sur Windows.");
  }
  const root = options.root ?? path.resolve(__dirname, "..");
  const output = path.join(root, "dist-app");
  validateArtifactInventory(fs.readdirSync(output));
  assertUpdateManifest(fs.readFileSync(path.join(output, "latest.yml"), "utf8"));

  const unpacked = path.join(output, "win-unpacked");
  const executable = path.join(unpacked, "AppPublisher.exe");
  const oauth = path.join(unpacked, "resources", "google-play-oauth.json");
  if (!fs.existsSync(executable)) throw new Error("Application Windows décompressée absente.");
  if (!fs.existsSync(oauth)) throw new Error("Client OAuth Google absent de l'application livrée.");
  validateDesktopOAuth(JSON.parse(fs.readFileSync(oauth, "utf8")));
  const architecture = assertX64PortableExecutable(executable);
  const appSignature = verifyAuthenticode(executable);
  const installer = path.join(output, "AppPublisher-Setup.exe");
  const installerSignature = verifyAuthenticode(installer);

  if (options.smokeInstall !== false) {
    const installDir = path.join(
      process.env.LOCALAPPDATA || os.tmpdir(),
      "Programs",
      "AppPublisher",
    );
    silentInstallSmokeTest(installer, installDir);
  }

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
    architecture,
    checks: {
      authenticodeApplication: "passed",
      authenticodeInstaller: "passed",
      silentInstallation: options.smokeInstall === false ? "not-run" : "passed",
      googleDesktopOAuth: "passed",
      updateManifest: "passed",
    },
    signer: {
      subject: installerSignature.Subject,
      thumbprint: installerSignature.Thumbprint,
      applicationThumbprint: appSignature.Thumbprint,
    },
    artifacts,
  };
  const reportDir = path.join(root, ".artifacts");
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportDir, "windows-release-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  return report;
}

if (require.main === module) {
  try {
    const report = certify();
    console.log(`✓ AppPublisher ${report.version} est signé et prêt pour Windows.`);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

module.exports = {
  ARTIFACTS,
  assertUpdateManifest,
  assertX64PortableExecutable,
  certify,
  silentInstallSmokeTest,
  validateArtifactInventory,
  validateDesktopOAuth,
};
