const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VERSION = "1.18.2";
const SHA256 = "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584";

const root = path.resolve(__dirname, "..");
const targetDir = path.join(root, "build", "tools");
const target = path.join(targetDir, "bundletool.jar");
const supplied = process.env.APPPUBLISHER_BUNDLETOOL_JAR
  ? path.resolve(process.env.APPPUBLISHER_BUNDLETOOL_JAR)
  : null;

function digest(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function verify(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  return digest(file) === SHA256;
}

fs.mkdirSync(targetDir, { recursive: true });

if (verify(target)) {
  console.log(`✓ bundletool ${VERSION} présent et vérifié.`);
  process.exit(0);
}

if (supplied && verify(supplied)) {
  fs.copyFileSync(supplied, target);
  console.log(`✓ bundletool ${VERSION} copié et vérifié.`);
  process.exit(0);
}

console.error(
  "✗ bundletool 1.18.2 vérifié introuvable. Placez le JAR officiel dans build/tools/bundletool.jar ou définissez APPPUBLISHER_BUNDLETOOL_JAR.",
);
process.exit(1);
