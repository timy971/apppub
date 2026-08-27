const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const failures = [];
const checks = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label, condition, detail) {
  checks.push({ label, ok: Boolean(condition), detail });
  if (!condition) failures.push(detail || label);
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const pkg = JSON.parse(read("package.json"));
const version = JSON.parse(read("version.json"));
const builder = read("electron-builder.config.cjs");
const quality = read(".github/workflows/quality.yml");
const candidate = read(".github/workflows/release-candidate.yml");
const macRelease = read(".github/workflows/release-macos.yml");
const winRelease = read(".github/workflows/release-windows.yml");

check(
  "Version synchronisée",
  pkg.version === version.version,
  `package.json (${pkg.version}) et version.json (${version.version}) doivent avoir la même version.`,
);
check(
  "Version SemVer stable",
  /^\d+\.\d+\.\d+$/.test(version.version),
  `La version ${version.version} doit être une SemVer stable avant la V1.`,
);

for (const rel of [
  "electron/main.cjs",
  "electron/preload.cjs",
  "build/icon.png",
  "build/icon.icns",
  "build/icon.ico",
  "scripts/pack.cjs",
  "scripts/release-mac.cjs",
  "scripts/release-win.cjs",
  "scripts/verify-mac-release.cjs",
  "scripts/verify-win-release.cjs",
]) {
  check(`Ressource ${rel}`, exists(rel), `Ressource de release absente : ${rel}`);
}

check(
  "macOS public universel",
  /target:\s*"dmg",\s*arch:\s*\["universal"\]/m.test(builder) &&
    /target:\s*"zip",\s*arch:\s*\["universal"\]/m.test(builder),
  "La future distribution publique macOS doit produire un DMG et un ZIP universels.",
);
check(
  "Bêta macOS privée en DMG universel",
  builder.includes("APPPUBLISHER_MAC_PRIVATE_BETA") &&
    pkg.scripts?.["pack:mac-beta"] === "node scripts/pack.cjs mac-beta" &&
    candidate.includes("bun run pack:mac-beta") &&
    candidate.includes("dist-app/AppPublisher.dmg") &&
    candidate.includes("hdiutil attach"),
  "La bêta privée macOS doit produire, monter et vérifier un DMG universel sans certificat Apple.",
);
check(
  "Windows NSIS x64",
  /target:\s*"nsis",\s*arch:\s*\["x64"\]/m.test(builder),
  "La bêta privée et la distribution publique Windows doivent utiliser un installateur NSIS x64.",
);
check(
  "Signature Windows publique obligatoire",
  /forceCodeSigning:\s*windowsDistribution/.test(builder),
  "Une distribution Windows publique ne doit jamais être publiée sans signature.",
);
check(
  "Bêta Windows privée sans certificat obligatoire",
  builder.includes("APPPUBLISHER_WIN_PRIVATE_BETA") &&
    builder.includes("windowsInstaller") &&
    pkg.scripts?.["pack:win-beta"] === "node scripts/pack.cjs win-beta" &&
    candidate.includes("bun run pack:win-beta") &&
    candidate.includes("dist-app/AppPublisher-Setup.exe"),
  "La bêta privée doit produire le vrai installateur Windows sans dépendre d'un certificat payant.",
);
check(
  "Notarisation macOS publique obligatoire",
  /notarize:\s*macDistribution/.test(builder) && /hardenedRuntime:\s*macDistribution/.test(builder),
  "Une distribution macOS publique doit être signée avec hardened runtime et notarisée.",
);
check(
  "Certification Android réelle",
  quality.includes("certify-android-pipeline.cjs") && quality.includes("Two signed Android releases"),
  "La Quality gate doit conserver la certification de deux AAB signés consécutifs.",
);

for (const [name, workflow] of [
  ["macOS", macRelease],
  ["Windows", winRelease],
]) {
  check(
    `Dépendances ${name} verrouillées`,
    workflow.includes("bun install --frozen-lockfile") && !workflow.includes("npm install --no-package-lock"),
    `Le workflow ${name} doit installer exactement les dépendances certifiées par bun.lock.`,
  );
  check(
    `Certification RC ${name}`,
    workflow.includes("node scripts/certify-release-candidate.cjs"),
    `Le workflow ${name} doit exécuter la certification source du lot 11 avant packaging.`,
  );
}

const reportDir = path.join(root, ".artifacts");
fs.mkdirSync(reportDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  version: version.version,
  channel: "private-beta",
  verdict: failures.length === 0 ? "ready-for-private-beta-smoke-tests" : "blocked",
  publicDistributionRequiresSigning: true,
  checks,
  failures,
};
fs.writeFileSync(
  path.join(reportDir, "release-candidate-certification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);

for (const item of checks) {
  console.log(`${item.ok ? "✓" : "✗"} ${item.label}`);
}

if (failures.length > 0) {
  console.error("\nRelease candidate bloquée :");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`\n✓ AppPublisher ${version.version} est prêt pour les smoke tests de bêta privée macOS/Windows.`);
