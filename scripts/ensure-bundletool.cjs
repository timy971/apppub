const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const VERSION = "1.18.2";
const SHA256 = "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584";
const DOWNLOAD_URL =
  "https://github.com/google/bundletool/releases/download/1.18.2/bundletool-all-1.18.2.jar";

const root = path.resolve(__dirname, "..");
const targetDir = path.join(root, "build", "tools");
const target = path.join(targetDir, "bundletool.jar");
const temp = path.join(targetDir, "bundletool.jar.download");
const supplied = process.env.APPPUBLISHER_BUNDLETOOL_JAR
  ? path.resolve(process.env.APPPUBLISHER_BUNDLETOOL_JAR)
  : null;

function digest(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function verify(file) {
  try {
    return fs.statSync(file).isFile() && digest(file) === SHA256;
  } catch {
    return false;
  }
}

function download(url, destination, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      { headers: { "User-Agent": "AppPublisher-packager" } },
      (response) => {
        const redirect =
          response.statusCode &&
          [301, 302, 303, 307, 308].includes(response.statusCode) &&
          response.headers.location;

        if (redirect) {
          response.resume();
          if (redirectsLeft <= 0) {
            reject(new Error("Trop de redirections pendant le téléchargement de bundletool."));
            return;
          }
          const nextUrl = new URL(response.headers.location, url).toString();
          download(nextUrl, destination, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Téléchargement de bundletool impossible (HTTP ${response.statusCode ?? "?"}).`,
            ),
          );
          return;
        }

        const out = fs.createWriteStream(destination, { mode: 0o600 });
        response.pipe(out);
        out.on("finish", () => out.close(resolve));
        out.on("error", reject);
      },
    );

    request.on("error", reject);
  });
}

async function main() {
  fs.mkdirSync(targetDir, { recursive: true });

  if (verify(target)) {
    console.log(`✓ bundletool ${VERSION} présent et vérifié.`);
    return;
  }

  if (supplied && verify(supplied)) {
    fs.copyFileSync(supplied, target);
    console.log(`✓ bundletool ${VERSION} copié et vérifié.`);
    return;
  }

  fs.rmSync(temp, { force: true });
  console.log(`• Téléchargement automatique de bundletool ${VERSION}…`);

  try {
    await download(DOWNLOAD_URL, temp);
    const actual = digest(temp);
    if (actual !== SHA256) {
      throw new Error(
        `Empreinte SHA-256 bundletool invalide. Attendue ${SHA256}, obtenue ${actual}.`,
      );
    }

    fs.rmSync(target, { force: true });
    fs.renameSync(temp, target);
    console.log(`✓ bundletool ${VERSION} téléchargé et vérifié.`);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

main().catch((error) => {
  console.error(`✗ ${error?.message || error}`);
  process.exit(1);
});
