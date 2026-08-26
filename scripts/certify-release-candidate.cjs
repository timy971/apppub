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
  "macOS universel",
  /target:\s*"dmg",\s*arch:\s*\["universal"\]/m.test(builder) &&
    /target:\s*"zip",\s*arch:\s*\["universal"\]/m.test(builder),
  "La distribution macOS doit produire un DMG et un ZIP universels.",
);
check(
  "Windows NSIS x64",
  /target:\s*"nsis",\s*arch:\s*\["x64"\]/m.test(builder),
  "La distribution Windows doit produire un installateur NSIS x64.",
);
check(
  "Signature Windows obligatoire",
  /forceCodeSigning:\s*windowsDistribution/.test(builder),
  "Une distribution Windows officielle ne doit jamais être publiée sans signature.",
);
check(
  "Notarisation macOS obligatoire",
  /notarize:\s*macDistribution/.test(builder) && /hardenedRuntime:\s*macDistribution/.test(builder),
  "Une distribution macOS officielle doit être signée avec hardened runtime et notarisée.",
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
  verdict: failures.length === 0 ? "ready-for-native-smoke-tests" : "blocked",
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

console.log(`\n✓ AppPublisher ${version.version} est prêt pour les smoke tests natifs macOS/Windows.`);
