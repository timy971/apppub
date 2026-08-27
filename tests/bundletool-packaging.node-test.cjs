const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  BUNDLETOOL_SHA256,
  BUNDLETOOL_VERSION,
  ensureBundletool,
  verifyBundletoolFile,
} = require("../scripts/ensure-bundletool.cjs");

function fakeResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === "content-length" ? String(bytes.length) : null) },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

test("downloads bundletool once and reuses only a checksum-valid cached file", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-bundletool-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "tools", "bundletool.jar");
  const bytes = Buffer.from("fake bundletool jar for deterministic test");
  const expectedSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return fakeResponse(bytes);
  };

  const first = await ensureBundletool({
    outputPath,
    expectedSha256,
    url: "https://example.invalid/bundletool.jar",
    fetchImpl,
  });
  assert.equal(first.downloaded, true);
  assert.equal(calls, 1);
  assert.equal(verifyBundletoolFile(outputPath, { expectedSha256 }), true);

  const second = await ensureBundletool({
    outputPath,
    expectedSha256,
    url: "https://example.invalid/bundletool.jar",
    fetchImpl,
  });
  assert.equal(second.downloaded, false);
  assert.equal(calls, 1);
});

test("rejects a downloaded bundletool whose SHA-256 does not match", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-bundletool-bad-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const outputPath = path.join(directory, "bundletool.jar");
  const bytes = Buffer.from("tampered bundletool");

  await assert.rejects(
    () =>
      ensureBundletool({
        outputPath,
        expectedSha256: "0".repeat(64),
        url: "https://example.invalid/bundletool.jar",
        fetchImpl: async () => fakeResponse(bytes),
      }),
    /Checksum bundletool invalide/,
  );
  assert.equal(fs.existsSync(outputPath), false);
});

test("pins the same bundletool version and checksum certified by AppPublisher", () => {
  assert.equal(BUNDLETOOL_VERSION, "1.18.2");
  assert.equal(BUNDLETOOL_SHA256, "378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584");
});

test("distributable packaging embeds bundletool at the runtime lookup path", () => {
  const root = path.resolve(__dirname, "..");
  const pack = fs.readFileSync(path.join(root, "scripts", "pack.cjs"), "utf8");
  const builder = fs.readFileSync(path.join(root, "electron-builder.config.cjs"), "utf8");
  const main = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");

  assert.match(pack, /ensure-bundletool\.cjs/);
  assert.match(pack, /distributableBuild/);
  assert.match(builder, /build\/tools\/bundletool\.jar/);
  assert.match(builder, /tools\/bundletool\.jar/);
  assert.match(main, /process\.resourcesPath/);
  assert.match(main, /tools.*bundletool\.jar/);
});
