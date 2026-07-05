/**
 * Synchronise la version depuis /version.json (source de vérité) vers
 * package.json. Appelé avant chaque packaging pour garantir que le binaire
 * généré porte la bonne version — sans avoir à modifier package.json
 * manuellement.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const versionPath = path.join(root, "version.json");
const pkgPath = path.join(root, "package.json");

const v = JSON.parse(fs.readFileSync(versionPath, "utf8"));
if (!v.version || !/^\d+\.\d+\.\d+$/.test(v.version)) {
  console.error(`version.json invalide : ${JSON.stringify(v)}`);
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.version !== v.version) {
  pkg.version = v.version;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`package.json → version ${v.version}`);
} else {
  console.log(`package.json déjà à jour (${v.version})`);
}
