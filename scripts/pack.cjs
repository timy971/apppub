/**
 * Orchestrateur de packaging AppPublisher.
 *
 *   node scripts/pack.cjs mac    → application locale ou DMG/ZIP de distribution
 *   node scripts/pack.cjs win    → build/nsis/zip Windows (x64)
 *
 * Étapes :
 *   1. Vérifications préalables (ressources, icônes, version).
 *   2. Synchronisation package.json ← version.json.
 *   3. Nettoyage complet du dossier de sortie (dist-app/).
 *   4. Build Vite (dist/).
 *   5. Exécution d'electron-builder avec la config partagée.
 *   6. Rapport final (fichiers produits, durée, version).
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const target = process.argv[2] || "mac";
const macDistribution = target === "mac" && process.env.APPPUBLISHER_MAC_DISTRIBUTION === "1";
const windowsDistribution = target === "win" && process.env.APPPUBLISHER_WIN_DISTRIBUTION === "1";
if (!["mac", "win"].includes(target)) {
  console.error(`Cible inconnue : ${target}. Utilisez "mac" ou "win".`);
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const distApp = path.join(root, "dist-app");
const buildDir = path.join(root, "build");
const dist = path.join(root, "dist");

const start = Date.now();
const info = (m) => console.log(`\x1b[36m•\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[33m!\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m✗\x1b[0m ${m}`);
  process.exit(1);
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.status !== 0) fail(`Commande échouée : ${cmd} ${args.join(" ")}`);
}

/**
 * Diagnostic : affiche la structure complète de dist/ en cas d'erreur.
 * Aide à comprendre pourquoi dist/index.html manque.
 */
function dumpDistStructure() {
  if (!fs.existsSync(dist)) {
    console.error(`\n  [DIAG] dist/ n'existe pas.`);
    return;
  }
  console.error(`\n  [DIAG] Contenu de dist/ :`);
  function walk(dir, prefix = "    ") {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const fullPath = path.join(dir, e.name);
        if (e.isDirectory()) {
          console.error(`${prefix}📁 ${e.name}/`);
          walk(fullPath, prefix + "  ");
        } else {
          const st = fs.statSync(fullPath);
          const size =
            st.size > 1024 * 100
              ? `${(st.size / 1024 / 1024).toFixed(1)}M`
              : `${(st.size / 1024).toFixed(1)}K`;
          console.error(`${prefix}📄 ${e.name} (${size})`);
        }
      }
    } catch {}
  }
  walk(dist);
}

/* ---------- 1. Vérifications ---------- */
info("Vérification des ressources…");
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
if (!version.version) fail("version.json ne contient pas de champ 'version'.");
ok(`Version : ${version.version} (build ${version.build ?? 1})`);

if (!fs.existsSync(path.join(buildDir, "icon.png"))) {
  fail("build/icon.png manquant. Ajoutez une icône source 1024×1024.");
}
ok("Icône source (icon.png) présente.");

if (target === "mac" && !fs.existsSync(path.join(buildDir, "icon.icns"))) {
  fail(
    "build/icon.icns manquant. Lancez npm run make:icons ou ajoutez l'icône macOS avant pack:mac.",
  );
}
if (target === "win" && !fs.existsSync(path.join(buildDir, "icon.ico"))) {
  fail("build/icon.ico manquant. Ajoutez l'icône Windows avant pack:win.");
}

for (const rel of ["electron/main.cjs", "electron/preload.cjs", "app.config.cjs"]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`Fichier manquant : ${rel}`);
}
ok("Fichiers Electron présents.");

/* ---------- 2. Sync version ---------- */
info("Synchronisation de la version…");
run(process.execPath, [path.join(root, "scripts", "sync-version.cjs")]);

/* ---------- 3. Nettoyage sortie ---------- */
info("Nettoyage du dossier de sortie…");
if (fs.existsSync(distApp)) {
  fs.rmSync(distApp, { recursive: true, force: true });
}
if (fs.existsSync(dist)) {
  fs.rmSync(dist, { recursive: true, force: true });
}
ok(`dist/ et dist-app/ nettoyés.`);

/* ---------- 4. Build Vite ---------- */
info("Compilation de l'interface (vite build — config Electron SPA)…");
run("npx", ["vite", "build", "--config", "vite.electron.config.ts"]);
if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
  dumpDistStructure();
  fail("dist/index.html non produit — la compilation a échoué.");
}
ok("Interface compilée.");

/* ---------- 5. electron-builder ---------- */
info(`Packaging Electron (${target})…`);
const ebArgs = ["electron-builder", "--config", "electron-builder.config.cjs"];
if (target === "mac") ebArgs.push("--mac");
if (target === "win") ebArgs.push("--win");
// La publication est volontairement séparée du packaging : un binaire ne
// peut atteindre GitHub Releases qu'après la certification complète du lot 9.
ebArgs.push("--publish", "never");
run("npx", ebArgs);

if (
  target === "mac" &&
  !macDistribution &&
  !fs.existsSync(path.join(distApp, "mac-arm64", "AppPublisher.app"))
) {
  fail("AppPublisher.app non produit — le packaging macOS n'est pas valide.");
}
if (macDistribution) {
  const artifacts = fs.existsSync(distApp) ? fs.readdirSync(distApp) : [];
  for (const required of [".dmg", ".zip"]) {
    if (!artifacts.some((name) => name.endsWith(required))) {
      fail(`Artefact ${required} non produit — la distribution macOS n'est pas valide.`);
    }
  }
  if (!artifacts.includes("latest-mac.yml")) {
    fail("latest-mac.yml non produit — les mises à jour automatiques ne fonctionneraient pas.");
  }
  ok("DMG, ZIP et manifeste de mise à jour produits.");
}
if (
  target === "win" &&
  !windowsDistribution &&
  !fs.existsSync(path.join(distApp, "win-unpacked", "AppPublisher.exe"))
) {
  fail("AppPublisher.exe non produit — le packaging Windows local n'est pas valide.");
}
if (windowsDistribution) {
  const artifacts = fs.existsSync(distApp) ? fs.readdirSync(distApp) : [];
  for (const required of [
    "AppPublisher-Setup.exe",
    "AppPublisher-Setup.exe.blockmap",
    "latest.yml",
  ]) {
    if (!artifacts.includes(required)) {
      fail(`Artefact ${required} non produit — la distribution Windows n'est pas valide.`);
    }
  }
  ok("Installateur EXE, blockmap et manifeste de mise à jour produits.");
}

/* ---------- 6. Rapport ---------- */
const produced = fs.existsSync(distApp)
  ? fs
      .readdirSync(distApp, { withFileTypes: true })
      .filter((d) => d.isFile() || d.isDirectory())
      .map((d) => d.name)
  : [];

const durationMs = Date.now() - start;
const seconds = Math.round(durationMs / 1000);

console.log("\n──────────────────────────────────────────────");
console.log(" Packaging terminé");
console.log("──────────────────────────────────────────────");
console.log(` Version   : ${version.version} (build ${version.build ?? 1})`);
console.log(
  ` Cible     : ${
    target === "mac"
      ? macDistribution
        ? "macOS universel — signé et notarisé"
        : "macOS (arm64) — développement local"
      : windowsDistribution
        ? "Windows 10/11 (x64) — signé"
        : "Windows (x64) — développement local"
  }`,
);
console.log(` Durée     : ${seconds} s`);
console.log(` Sortie    : dist-app/`);
for (const name of produced) {
  console.log(`   • ${name}`);
}
console.log("──────────────────────────────────────────────\n");
