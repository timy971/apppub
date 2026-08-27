/**
 * Orchestrateur de packaging AppPublisher.
 *
 *   node scripts/pack.cjs mac       → application macOS locale
 *   node scripts/pack.cjs mac-beta  → DMG privés arm64 + x64 non signés
 *   node scripts/pack.cjs win       → application Windows locale (x64)
 *   node scripts/pack.cjs win-beta  → installateur NSIS privé non signé (x64)
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { ensureGoogleOAuthBuildConfig } = require("./google-oauth-build-config.cjs");

const requestedTarget = process.argv[2] || "mac";
if (!["mac", "mac-beta", "win", "win-beta"].includes(requestedTarget)) {
  console.error(
    `Cible inconnue : ${requestedTarget}. Utilisez "mac", "mac-beta", "win" ou "win-beta".`,
  );
  process.exit(1);
}
const target = requestedTarget === "mac-beta" ? "mac" : requestedTarget === "win-beta" ? "win" : requestedTarget;
const macPrivateBeta = requestedTarget === "mac-beta";
const windowsPrivateBeta = requestedTarget === "win-beta";
if (macPrivateBeta) process.env.APPPUBLISHER_MAC_PRIVATE_BETA = "1";
if (windowsPrivateBeta) process.env.APPPUBLISHER_WIN_PRIVATE_BETA = "1";

const macDistribution = target === "mac" && process.env.APPPUBLISHER_MAC_DISTRIBUTION === "1";
const windowsDistribution = target === "win" && process.env.APPPUBLISHER_WIN_DISTRIBUTION === "1";
const windowsInstaller = windowsDistribution || windowsPrivateBeta;
const distributableBuild = macPrivateBeta || windowsPrivateBeta || macDistribution || windowsDistribution;

const root = path.resolve(__dirname, "..");
const distApp = path.join(root, "dist-app");
const buildDir = path.join(root, "build");
const dist = path.join(root, "dist");

const start = Date.now();
const info = (m) => console.log(`\x1b[36m•\x1b[0m ${m}`);
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[31m✗\x1b[0m ${m}`);
  process.exit(1);
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
  if (r.error) fail(`Impossible de lancer ${cmd} : ${r.error.message}`);
  if (r.status !== 0) fail(`Commande échouée : ${cmd} ${args.join(" ")}`);
}

function runLocalNodeTool(relativeCliPath, args) {
  const cliPath = path.join(root, "node_modules", ...relativeCliPath.split("/"));
  if (!fs.existsSync(cliPath)) {
    fail(`Outil de build local absent : ${relativeCliPath}. Réinstallez les dépendances verrouillées.`);
  }
  run(process.execPath, [cliPath, ...args]);
}

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
          const size = st.size > 1024 * 100 ? `${(st.size / 1024 / 1024).toFixed(1)}M` : `${(st.size / 1024).toFixed(1)}K`;
          console.error(`${prefix}📄 ${e.name} (${size})`);
        }
      }
    } catch {}
  }
  walk(dist);
}

info("Vérification des ressources…");
const version = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8"));
if (!version.version) fail("version.json ne contient pas de champ 'version'.");
ok(`Version : ${version.version} (build ${version.build ?? 1})`);

if (!fs.existsSync(path.join(buildDir, "icon.png"))) {
  fail("build/icon.png manquant. Ajoutez une icône source 1024×1024.");
}
ok("Icône source (icon.png) présente.");

if (target === "mac" && !fs.existsSync(path.join(buildDir, "icon.icns"))) {
  fail("build/icon.icns manquant. Lancez npm run make:icons ou ajoutez l'icône macOS avant le packaging.");
}
if (target === "win" && !fs.existsSync(path.join(buildDir, "icon.ico"))) {
  fail("build/icon.ico manquant. Ajoutez l'icône Windows avant pack:win.");
}

for (const rel of ["electron/main.cjs", "electron/preload.cjs", "app.config.cjs"]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`Fichier manquant : ${rel}`);
}
ok("Fichiers Electron présents.");

if (distributableBuild) {
  info("Préparation de la connexion Google intégrée…");
  try {
    const oauth = ensureGoogleOAuthBuildConfig({ required: true });
    ok(
      `Client OAuth AppPublisher intégré (${oauth.hasClientSecret ? "Client ID + secret optionnel" : "Client ID public uniquement"}).`,
    );
  } catch (error) {
    fail(error?.message ?? String(error));
  }
}

info("Synchronisation de la version…");
run(process.execPath, [path.join(root, "scripts", "sync-version.cjs")]);

info("Nettoyage du dossier de sortie…");
if (fs.existsSync(distApp)) fs.rmSync(distApp, { recursive: true, force: true });
if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true, force: true });
ok(`dist/ et dist-app/ nettoyés.`);

info("Compilation de l'interface (vite build — config Electron SPA)…");
runLocalNodeTool("vite/bin/vite.js", ["build", "--config", "vite.electron.config.ts"]);
if (!fs.existsSync(path.join(root, "dist", "index.html"))) {
  dumpDistStructure();
  fail("dist/index.html non produit — la compilation a échoué.");
}
ok("Interface compilée.");

info(`Packaging Electron (${requestedTarget})…`);
const ebArgs = ["--config", "electron-builder.config.cjs"];
if (target === "mac") ebArgs.push("--mac");
if (target === "win") ebArgs.push("--win");
ebArgs.push("--publish", "never");
runLocalNodeTool("electron-builder/cli.js", ebArgs);

if (
  target === "mac" &&
  !macDistribution &&
  !macPrivateBeta &&
  !fs.existsSync(path.join(distApp, "mac-arm64", "AppPublisher.app"))
) {
  fail("AppPublisher.app non produit — le packaging macOS n'est pas valide.");
}
if (macPrivateBeta) {
  const artifacts = fs.existsSync(distApp) ? fs.readdirSync(distApp) : [];
  for (const required of ["AppPublisher-arm64.dmg", "AppPublisher-x64.dmg"]) {
    if (!artifacts.includes(required)) {
      fail(`${required} non produit — la bêta privée macOS n'est pas complète.`);
    }
  }
  ok("DMG arm64 et x64 de bêta privée produits sans certificat Apple.");
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
  !windowsInstaller &&
  !fs.existsSync(path.join(distApp, "win-unpacked", "AppPublisher.exe"))
) {
  fail("AppPublisher.exe non produit — le packaging Windows local n'est pas valide.");
}
if (windowsInstaller) {
  const artifacts = fs.existsSync(distApp) ? fs.readdirSync(distApp) : [];
  if (!artifacts.includes("AppPublisher-Setup.exe")) {
    fail("AppPublisher-Setup.exe non produit — l'installateur Windows n'est pas valide.");
  }
  if (windowsDistribution) {
    for (const required of ["AppPublisher-Setup.exe.blockmap", "latest.yml"]) {
      if (!artifacts.includes(required)) {
        fail(`Artefact ${required} non produit — la distribution Windows publique n'est pas valide.`);
      }
    }
    ok("Installateur signé, blockmap et manifeste de mise à jour produits.");
  } else {
    ok("Installateur NSIS de bêta privée produit sans exiger de certificat.");
  }
}

const produced = fs.existsSync(distApp)
  ? fs
      .readdirSync(distApp, { withFileTypes: true })
      .filter((d) => d.isFile() || d.isDirectory())
      .map((d) => d.name)
  : [];

const seconds = Math.round((Date.now() - start) / 1000);
console.log("\n──────────────────────────────────────────────");
console.log(" Packaging terminé");
console.log("──────────────────────────────────────────────");
console.log(` Version   : ${version.version} (build ${version.build ?? 1})`);
console.log(
  ` Cible     : ${
    target === "mac"
      ? macDistribution
        ? "macOS universel — signé et notarisé"
        : macPrivateBeta
          ? "macOS — DMG arm64 + x64 de bêta privée non signés"
          : "macOS (arm64) — développement local"
      : windowsDistribution
        ? "Windows 10/11 (x64) — distribution publique signée"
        : windowsPrivateBeta
          ? "Windows 10/11 (x64) — installateur bêta privée non signé"
          : "Windows (x64) — développement local"
  }`,
);
console.log(` Durée     : ${seconds} s`);
console.log(` Sortie    : dist-app/`);
for (const name of produced) console.log(`   • ${name}`);
console.log("──────────────────────────────────────────────\n");