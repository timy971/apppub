const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildValidationReport,
  inspectAabArchive,
  parseManifest,
} = require("../electron/aab-inspector.cjs");

function varint(value) {
  let current = BigInt(value);
  const bytes = [];
  do {
    let byte = Number(current & 0x7fn);
    current >>= 7n;
    if (current) byte |= 0x80;
    bytes.push(byte);
  } while (current);
  return Buffer.from(bytes);
}

function field(number, wire, value) {
  return Buffer.concat([varint((number << 3) | wire), value]);
}

function textField(number, value) {
  const content = Buffer.from(String(value));
  return field(number, 2, Buffer.concat([varint(content.length), content]));
}

function messageField(number, content) {
  return field(number, 2, Buffer.concat([varint(content.length), content]));
}

function varintField(number, value) {
  return field(number, 0, varint(value));
}

function attribute(name, value) {
  return Buffer.concat([textField(2, name), textField(3, value)]);
}

function compiledIntegerAttribute(name, value) {
  const primitive = varintField(6, value);
  const item = messageField(7, primitive);
  return Buffer.concat([textField(2, name), messageField(6, item)]);
}

function element(name, attributes = {}, children = []) {
  return Buffer.concat([
    textField(3, name),
    ...Object.entries(attributes).map(([key, value]) => messageField(4, attribute(key, value))),
    ...children.map((child) => messageField(5, messageField(1, child))),
  ]);
}

function elementWithAttributes(name, attributes, children = []) {
  return Buffer.concat([
    textField(3, name),
    ...attributes.map((value) => messageField(4, value)),
    ...children.map((child) => messageField(5, messageField(1, child))),
  ]);
}

function manifestBuffer(overrides = {}) {
  const sdk = element("uses-sdk", {
    minSdkVersion: overrides.minSdk ?? "24",
    targetSdkVersion: overrides.targetSdk ?? "35",
  });
  const root = element(
    "manifest",
    {
      package: overrides.packageName ?? "app.lovable.cranioscan.twa",
      versionName: overrides.versionName ?? "1.2.3",
      versionCode: overrides.versionCode ?? "42",
    },
    [sdk],
  );
  return messageField(1, root);
}

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, contentInput] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const content = Buffer.from(contentInput);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

test("extracts the Play identity and SDK values from the protobuf manifest", () => {
  assert.deepEqual(parseManifest(manifestBuffer()), {
    packageName: "app.lovable.cranioscan.twa",
    versionName: "1.2.3",
    versionCode: 42,
    minSdk: 24,
    targetSdk: 35,
  });
});

test("reads numeric attributes from their official compiled Item representation", () => {
  const sdk = elementWithAttributes("uses-sdk", [
    compiledIntegerAttribute("minSdkVersion", 26),
    compiledIntegerAttribute("targetSdkVersion", 35),
  ]);
  const manifest = elementWithAttributes(
    "manifest",
    [
      attribute("package", "app.example.compiled"),
      attribute("versionName", "2.0.0"),
      compiledIntegerAttribute("versionCode", 77),
    ],
    [sdk],
  );
  assert.deepEqual(parseManifest(messageField(1, manifest)), {
    packageName: "app.example.compiled",
    versionName: "2.0.0",
    versionCode: 77,
    minSdk: 26,
    targetSdk: 35,
  });
});

test("inspects a real AAB-shaped ZIP without extracting untrusted files", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-aab-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const aabPath = path.join(directory, "app-release.aab");
  fs.writeFileSync(
    aabPath,
    makeStoredZip({
      "BundleConfig.pb": Buffer.from([1]),
      "base/manifest/AndroidManifest.xml": manifestBuffer(),
      "feature/manifest/AndroidManifest.xml": manifestBuffer(),
      "../../outside": "never extracted",
    }),
  );

  const result = inspectAabArchive(aabPath);
  assert.equal(result.packageName, "app.lovable.cranioscan.twa");
  assert.equal(result.versionCode, 42);
  assert.equal(result.hasBundleConfig, true);
  assert.deepEqual(result.modules, ["base", "feature"]);
  assert.match(result.artifactSha256, /^[A-F0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(directory, "outside")), false);
});

const archive = {
  packageName: "app.lovable.cranioscan.twa",
  versionName: "1.2.3",
  versionCode: 42,
  minSdk: 24,
  targetSdk: 35,
  modules: ["base"],
  artifactSha256: "A".repeat(64),
  artifactSizeBytes: 1234,
  hasBundleConfig: true,
};

const expected = {
  packageName: "app.lovable.cranioscan.twa",
  versionName: "1.2.3",
  versionCode: 42,
  signerSha256: "11:22:33",
};

test("returns ready only when identity, signature and bundletool all agree", () => {
  const report = buildValidationReport({
    archive,
    expected,
    signature: { ok: true, sha256: "112233", certificate: "CN=CranioScan" },
    bundletool: { status: "passed", version: "1.18.2" },
    inspectedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(report.verdict, "ready");
  assert.deepEqual(report.issues, []);
  assert.equal(report.signerSha256, "112233");
});

test("blocks the exact wrong-package and wrong-upload-key scenario", () => {
  const report = buildValidationReport({
    archive: { ...archive, packageName: "app.cranioscan.android" },
    expected,
    signature: { ok: true, sha256: "AABBCC", certificate: "CN=Other" },
    bundletool: { status: "passed" },
    inspectedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(report.verdict, "blocked");
  assert.ok(report.issues.some((issue) => issue.id === "package-mismatch"));
  assert.ok(report.issues.some((issue) => issue.id === "signer-mismatch"));
});

test("keeps a structurally valid AAB usable but warns when bundletool is unavailable", () => {
  const report = buildValidationReport({
    archive,
    expected,
    signature: { ok: true, sha256: "112233" },
    bundletool: { status: "unavailable" },
    inspectedAt: "2026-08-03T00:00:00.000Z",
  });
  assert.equal(report.verdict, "warnings");
  assert.deepEqual(
    report.issues.map((issue) => issue.id),
    ["bundletool-unavailable"],
  );
});
