const crypto = require("crypto");
const fs = require("fs");
const zlib = require("zlib");

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;
const MAX_MANIFEST_SIZE = 16 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_SIZE = 64 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 100_000;

function normalizeFingerprint(value) {
  return typeof value === "string" ? value.replace(/[^0-9a-f]/gi, "").toUpperCase() : undefined;
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  const chunk = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read = 0;
    do {
      read = fs.readSync(fd, chunk, 0, chunk.length, null);
      if (read > 0) hash.update(chunk.subarray(0, read));
    } while (read > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex").toUpperCase();
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === EOCD_SIGNATURE &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      return offset;
    }
  }
  throw new Error("Le fichier n'est pas une archive ZIP Android valide.");
}

function readExactly(fd, length, position) {
  const buffer = Buffer.allocUnsafe(length);
  let total = 0;
  while (total < length) {
    const read = fs.readSync(fd, buffer, total, length - total, position + total);
    if (read <= 0) throw new Error("L'archive AAB est tronquée.");
    total += read;
  }
  return buffer;
}

function readZipDirectory(filePath) {
  const stat = fs.statSync(filePath);
  const fd = fs.openSync(filePath, "r");
  let tail;
  try {
    const tailLength = Math.min(stat.size, MAX_EOCD_SEARCH);
    tail = readExactly(fd, tailLength, stat.size - tailLength);
  } finally {
    fs.closeSync(fd);
  }
  const eocd = findEndOfCentralDirectory(tail);
  const diskNumber = tail.readUInt16LE(eocd + 4);
  const directoryDisk = tail.readUInt16LE(eocd + 6);
  const entriesOnDisk = tail.readUInt16LE(eocd + 8);
  const entriesCount = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || directoryDisk !== 0 || entriesOnDisk !== entriesCount) {
    throw new Error(
      "Les archives ZIP réparties sur plusieurs volumes ne sont pas prises en charge.",
    );
  }
  if (entriesCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("Les archives ZIP64 ne sont pas prises en charge par l'inspection interne.");
  }
  if (entriesCount > MAX_ZIP_ENTRIES || directorySize > MAX_CENTRAL_DIRECTORY_SIZE) {
    throw new Error("Le répertoire central de l'AAB est anormalement grand.");
  }
  if (directoryOffset + directorySize > stat.size) {
    throw new Error("Le répertoire central de l'AAB est incomplet.");
  }

  const directoryFd = fs.openSync(filePath, "r");
  let buffer;
  try {
    buffer = readExactly(directoryFd, directorySize, directoryOffset);
  } finally {
    fs.closeSync(directoryFd);
  }

  const entries = new Map();
  let cursor = 0;
  for (let index = 0; index < entriesCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new Error("Le répertoire central de l'AAB est corrompu.");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > buffer.length) throw new Error("Une entrée ZIP de l'AAB est incomplète.");
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (entries.has(name)) throw new Error(`L'AAB contient une entrée ZIP dupliquée : ${name}.`);
    entries.set(name, {
      flags,
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    cursor = end;
  }
  return { filePath, fileSize: stat.size, entries };
}

function readZipEntry(archive, name, maxSize = MAX_MANIFEST_SIZE) {
  const entry = archive.entries.get(name);
  if (!entry) return null;
  if ((entry.flags & 1) !== 0) throw new Error(`L'entrée ${name} est chiffrée.`);
  if (entry.uncompressedSize > maxSize)
    throw new Error(`L'entrée ${name} est anormalement grande.`);
  const offset = entry.localOffset;
  if (entry.compressedSize > maxSize * 2)
    throw new Error(`L'entrée ${name} est anormalement grande.`);
  const fd = fs.openSync(archive.filePath, "r");
  let compressed;
  try {
    const header = readExactly(fd, 30, offset);
    if (header.readUInt32LE(0) !== LOCAL_SIGNATURE) {
      throw new Error(`L'en-tête ZIP de ${name} est invalide.`);
    }
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const start = offset + 30 + nameLength + extraLength;
    const end = start + entry.compressedSize;
    if (end > archive.fileSize) throw new Error(`Les données ZIP de ${name} sont incomplètes.`);
    compressed = readExactly(fd, entry.compressedSize, start);
  } finally {
    fs.closeSync(fd);
  }
  let content;
  if (entry.method === 0) content = Buffer.from(compressed);
  else if (entry.method === 8) content = zlib.inflateRawSync(compressed);
  else throw new Error(`La compression ZIP ${entry.method} de ${name} n'est pas prise en charge.`);
  if (content.length !== entry.uncompressedSize || content.length > maxSize) {
    throw new Error(`La taille décompressée de ${name} est invalide.`);
  }
  return content;
}

function readVarint(buffer, start) {
  let value = 0n;
  let shift = 0n;
  let cursor = start;
  while (cursor < buffer.length && shift <= 63n) {
    const byte = buffer[cursor++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, cursor };
    shift += 7n;
  }
  throw new Error("Message protobuf AAB invalide.");
}

function decodeMessage(buffer) {
  const fields = [];
  let cursor = 0;
  while (cursor < buffer.length) {
    const key = readVarint(buffer, cursor);
    cursor = key.cursor;
    const field = Number(key.value >> 3n);
    const wire = Number(key.value & 7n);
    if (field <= 0) throw new Error("Champ protobuf AAB invalide.");
    if (wire === 0) {
      const decoded = readVarint(buffer, cursor);
      fields.push({ field, wire, value: decoded.value });
      cursor = decoded.cursor;
    } else if (wire === 1) {
      if (cursor + 8 > buffer.length) throw new Error("Champ protobuf AAB tronqué.");
      fields.push({ field, wire, value: buffer.subarray(cursor, cursor + 8) });
      cursor += 8;
    } else if (wire === 2) {
      const decoded = readVarint(buffer, cursor);
      const length = Number(decoded.value);
      cursor = decoded.cursor;
      if (!Number.isSafeInteger(length) || length < 0 || cursor + length > buffer.length) {
        throw new Error("Champ protobuf AAB tronqué.");
      }
      fields.push({ field, wire, value: buffer.subarray(cursor, cursor + length) });
      cursor += length;
    } else if (wire === 5) {
      if (cursor + 4 > buffer.length) throw new Error("Champ protobuf AAB tronqué.");
      fields.push({ field, wire, value: buffer.subarray(cursor, cursor + 4) });
      cursor += 4;
    } else {
      throw new Error(`Type protobuf AAB non pris en charge (${wire}).`);
    }
  }
  return fields;
}

function messages(fields, number) {
  return fields
    .filter((item) => item.field === number && item.wire === 2)
    .map((item) => item.value);
}

function firstString(fields, number) {
  const value = fields.find((item) => item.field === number && item.wire === 2)?.value;
  return value ? value.toString("utf8") : undefined;
}

function firstVarint(fields, number) {
  const value = fields.find((item) => item.field === number && item.wire === 0)?.value;
  if (value == null || value > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return Number(value);
}

function compiledAttributeValue(buffer) {
  if (!buffer) return undefined;
  const item = decodeMessage(buffer);
  const stringItem = messages(item, 2)[0];
  if (stringItem) return firstString(decodeMessage(stringItem), 1);
  const rawString = messages(item, 3)[0];
  if (rawString) return firstString(decodeMessage(rawString), 1);
  const primitive = messages(item, 7)[0];
  if (!primitive) return undefined;
  const primitiveFields = decodeMessage(primitive);
  return (
    firstVarint(primitiveFields, 6) ??
    firstVarint(primitiveFields, 7) ??
    firstVarint(primitiveFields, 8)
  );
}

function parseAttribute(buffer) {
  const fields = decodeMessage(buffer);
  const raw = firstString(fields, 3);
  return {
    name: firstString(fields, 2),
    value: raw !== undefined && raw !== "" ? raw : compiledAttributeValue(messages(fields, 6)[0]),
  };
}

function parseElement(buffer) {
  const fields = decodeMessage(buffer);
  const attributes = Object.fromEntries(
    messages(fields, 4)
      .map(parseAttribute)
      .filter((attribute) => attribute.name && attribute.value !== undefined)
      .map((attribute) => [attribute.name, attribute.value]),
  );
  const children = messages(fields, 5)
    .map((node) => messages(decodeMessage(node), 1)[0])
    .filter(Boolean)
    .map(parseElement);
  return { name: firstString(fields, 3), attributes, children };
}

function parseManifest(buffer) {
  const rootElement = messages(decodeMessage(buffer), 1)[0];
  if (!rootElement) throw new Error("Le manifeste protobuf de l'AAB est illisible.");
  const manifest = parseElement(rootElement);
  if (manifest.name !== "manifest") throw new Error("La racine du manifeste AAB est invalide.");
  const usesSdk = manifest.children.find((child) => child.name === "uses-sdk");
  const asNumber = (value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
    return undefined;
  };
  return {
    packageName:
      typeof manifest.attributes.package === "string" ? manifest.attributes.package : undefined,
    versionName:
      typeof manifest.attributes.versionName === "string"
        ? manifest.attributes.versionName
        : undefined,
    versionCode: asNumber(manifest.attributes.versionCode),
    minSdk: asNumber(usesSdk?.attributes.minSdkVersion),
    targetSdk: asNumber(usesSdk?.attributes.targetSdkVersion),
  };
}

function inspectAabArchive(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error("Le fichier AAB est vide ou introuvable.");
  const archive = readZipDirectory(filePath);
  const manifestBuffer = readZipEntry(archive, "base/manifest/AndroidManifest.xml");
  if (!manifestBuffer) throw new Error("Le manifeste du module de base est absent de l'AAB.");
  const manifest = parseManifest(manifestBuffer);
  const modules = [...archive.entries.keys()]
    .filter((name) => /^[^/]+\/manifest\/AndroidManifest\.xml$/.test(name))
    .map((name) => name.split("/")[0])
    .sort();
  return {
    ...manifest,
    artifactSha256: sha256File(filePath),
    artifactSizeBytes: stat.size,
    modules,
    hasBundleConfig: archive.entries.has("BundleConfig.pb"),
  };
}

function buildValidationReport({
  archive,
  signature,
  bundletool,
  expected,
  inspectedAt,
  reportPath,
}) {
  const issues = [];
  const add = (id, severity, title, detail) => issues.push({ id, severity, title, detail });
  const expectedSigner = normalizeFingerprint(expected?.signerSha256);
  const actualSigner = normalizeFingerprint(signature?.sha256);

  if (!archive.hasBundleConfig) {
    add(
      "bundle-config-missing",
      "error",
      "Configuration AAB absente",
      "BundleConfig.pb est introuvable.",
    );
  }
  if (!archive.packageName) {
    add(
      "package-missing",
      "error",
      "Package illisible",
      "Le package Android n'a pas pu être extrait du manifeste.",
    );
  } else if (!expected?.packageName) {
    add(
      "expected-package-missing",
      "warning",
      "Package de référence absent",
      "L'AAB contient un package, mais le projet AppPublisher n'en définit aucun pour la comparaison.",
    );
  } else if (expected?.packageName && archive.packageName !== expected.packageName) {
    add(
      "package-mismatch",
      "error",
      "Mauvais package Android",
      `L'AAB contient « ${archive.packageName} » au lieu de « ${expected.packageName} » attendu par le projet.`,
    );
  }
  if (expected?.versionName && archive.versionName !== expected.versionName) {
    add(
      "version-name-mismatch",
      "error",
      "Version incohérente",
      `L'AAB contient la version « ${archive.versionName ?? "inconnue"} » au lieu de « ${expected.versionName} ».`,
    );
  }
  if (expected?.versionCode != null && archive.versionCode !== expected.versionCode) {
    add(
      "version-code-mismatch",
      "error",
      "Numéro de build incohérent",
      `L'AAB contient le versionCode ${archive.versionCode ?? "inconnu"} au lieu de ${expected.versionCode}.`,
    );
  }
  if (!signature?.ok) {
    add(
      "signature-invalid",
      "error",
      "Signature invalide",
      signature?.errorHint ?? "La signature JAR de l'AAB n'a pas pu être validée.",
    );
  } else if (!expectedSigner) {
    add(
      "expected-signer-missing",
      "warning",
      "Clé de référence absente",
      "La signature est valide, mais le profil AppPublisher ne contient pas d'empreinte à comparer.",
    );
  } else if (actualSigner !== expectedSigner) {
    add(
      "signer-mismatch",
      "error",
      "Mauvaise clé d'importation",
      "Le certificat qui signe l'AAB ne correspond pas au profil associé au projet.",
    );
  }
  if (archive.minSdk == null || archive.targetSdk == null) {
    add(
      "sdk-unreadable",
      "warning",
      "SDK à contrôler",
      "Le SDK minimal ou cible n'a pas pu être extrait du manifeste.",
    );
  } else if (archive.targetSdk < archive.minSdk) {
    add(
      "sdk-invalid",
      "error",
      "SDK incohérents",
      `Le targetSdk ${archive.targetSdk} est inférieur au minSdk ${archive.minSdk}.`,
    );
  }
  if (bundletool?.status === "failed") {
    add(
      "bundletool-failed",
      "error",
      "Bundletool refuse l'AAB",
      bundletool.detail ?? "La validation bundletool a échoué.",
    );
  } else if (bundletool?.status === "unavailable") {
    add(
      "bundletool-unavailable",
      "warning",
      "Contrôle bundletool non exécuté",
      "L'analyse interne est terminée, mais bundletool n'est pas installé ou embarqué.",
    );
  }

  const verdict = issues.some((issue) => issue.severity === "error")
    ? "blocked"
    : issues.some((issue) => issue.severity === "warning")
      ? "warnings"
      : "ready";
  return {
    schemaVersion: 1,
    inspectedAt,
    verdict,
    packageName: archive.packageName,
    versionName: archive.versionName,
    versionCode: archive.versionCode,
    minSdk: archive.minSdk,
    targetSdk: archive.targetSdk,
    modules: archive.modules,
    artifactSha256: archive.artifactSha256,
    artifactSizeBytes: archive.artifactSizeBytes,
    signatureValid: !!signature?.ok,
    signerSha256: actualSigner,
    signerCertificate: signature?.certificate,
    expected: {
      packageName: expected?.packageName,
      versionName: expected?.versionName,
      versionCode: expected?.versionCode,
      signerSha256: expectedSigner,
    },
    bundletool: bundletool ?? { status: "unavailable" },
    issues,
    reportPath,
  };
}

module.exports = {
  buildValidationReport,
  inspectAabArchive,
  normalizeFingerprint,
  parseManifest,
  readZipDirectory,
  readZipEntry,
  sha256File,
};
