const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const BUNDLETOOL_VERSION = "1.18.2";
const BUNDLETOOL_SHA256 = "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584";
const BUNDLETOOL_URL = `https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar`;
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, "..", "build", "tools", "bundletool.jar");
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath, fsModule = fs) {
  const hash = crypto.createHash("sha256");
  const fd = fsModule.openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read = 0;
    do {
      read = fsModule.readSync(fd, chunk, 0, chunk.length, null);
      if (read > 0) hash.update(chunk.subarray(0, read));
    } while (read > 0);
  } finally {
    fsModule.closeSync(fd);
  }
  return hash.digest("hex");
}

function verifyBundletoolFile(filePath, options = {}) {
  const fsModule = options.fsModule ?? fs;
  const expectedSha256 = (options.expectedSha256 ?? BUNDLETOOL_SHA256).toLowerCase();
  try {
    const stat = fsModule.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_DOWNLOAD_BYTES) return false;
    return sha256File(filePath, fsModule).toLowerCase() === expectedSha256;
  } catch {
    return false;
  }
}

async function downloadBuffer(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Le moteur de téléchargement Node est indisponible.");
  }
  const response = await fetchImpl(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
    headers: { "user-agent": "AppPublisher-build" },
  });
  if (!response?.ok) {
    throw new Error(`Téléchargement bundletool refusé (HTTP ${response?.status ?? "?"}).`);
  }
  const declaredLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new Error("Le fichier bundletool annoncé est anormalement volumineux.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length <= 0 || bytes.length > MAX_DOWNLOAD_BYTES) {
    throw new Error("Le fichier bundletool téléchargé a une taille invalide.");
  }
  return bytes;
}

async function ensureBundletool(options = {}) {
  const fsModule = options.fsModule ?? fs;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const expectedSha256 = (options.expectedSha256 ?? BUNDLETOOL_SHA256).toLowerCase();
  const url = options.url ?? BUNDLETOOL_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (verifyBundletoolFile(outputPath, { fsModule, expectedSha256 })) {
    return {
      path: outputPath,
      version: BUNDLETOOL_VERSION,
      sha256: expectedSha256,
      downloaded: false,
    };
  }

  fsModule.mkdirSync(path.dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.part-${process.pid}-${Date.now()}`;
  try {
    const bytes = await downloadBuffer(url, fetchImpl);
    const actualSha256 = sha256Buffer(bytes).toLowerCase();
    if (actualSha256 !== expectedSha256) {
      throw new Error(
        `Checksum bundletool invalide : ${actualSha256} au lieu de ${expectedSha256}.`,
      );
    }
    fsModule.writeFileSync(temporaryPath, bytes, { mode: 0o644 });
    if (!verifyBundletoolFile(temporaryPath, { fsModule, expectedSha256 })) {
      throw new Error("Le contrôle local de bundletool a échoué après téléchargement.");
    }
    fsModule.rmSync(outputPath, { force: true });
    fsModule.renameSync(temporaryPath, outputPath);
    return {
      path: outputPath,
      version: BUNDLETOOL_VERSION,
      sha256: expectedSha256,
      downloaded: true,
    };
  } finally {
    fsModule.rmSync(temporaryPath, { force: true });
  }
}

if (require.main === module) {
  ensureBundletool()
    .then((result) => {
      process.stdout.write(
        `✓ bundletool ${result.version} prêt (${result.downloaded ? "téléchargé" : "cache vérifié"}, sha256 ${result.sha256}).\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(`✗ ${error?.message ?? error}\n`);
      process.exitCode = 1;
    });
}

module.exports = {
  BUNDLETOOL_SHA256,
  BUNDLETOOL_URL,
  BUNDLETOOL_VERSION,
  DEFAULT_OUTPUT_PATH,
  ensureBundletool,
  sha256Buffer,
  sha256File,
  verifyBundletoolFile,
};
