const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  assertReleaseSequence,
  certificateForAab,
  parseSha256,
  safeOutputDirectory,
} = require("../scripts/certify-android-pipeline.cjs");

function report(overrides = {}) {
  return {
    verdict: "ready",
    versionCode: 100,
    signerSha256: "AA11",
    artifactSha256: "artifact-one",
    ...overrides,
  };
}

test("accepts two ready releases with an increasing code and stable certificate", () => {
  assert.equal(
    assertReleaseSequence([report(), report({ versionCode: 101, artifactSha256: "artifact-two" })]),
    true,
  );
});

test("rejects a signing-key change between releases", () => {
  assert.throws(
    () =>
      assertReleaseSequence([
        report(),
        report({ versionCode: 101, signerSha256: "BB22", artifactSha256: "artifact-two" }),
      ]),
    /same signing certificate/,
  );
});

test("rejects a non-increasing versionCode and a non-ready verdict", () => {
  assert.throws(
    () => assertReleaseSequence([report(), report({ artifactSha256: "artifact-two" })]),
    /strictly greater/,
  );
  assert.throws(
    () =>
      assertReleaseSequence([
        report(),
        report({ verdict: "warnings", versionCode: 101, artifactSha256: "artifact-two" }),
      ]),
    /ready verdict/,
  );
});

test("normalizes the certificate fingerprint emitted by keytool", () => {
  assert.equal(parseSha256("SHA256: AA:bb:01:22"), "AABB0122");
});

test("accepts a verified self-signed test AAB and reads its certificate", () => {
  const calls = [];
  const result = certificateForAab("release.aab", (command, args) => {
    calls.push([command, args]);
    return command === "jarsigner"
      ? "jar verified.\nWarning: This jar contains entries whose certificate chain is invalid."
      : "Owner: CN=AppPublisher CI\nSHA256: AA:BB:01:22";
  });
  assert.equal(result.sha256, "AABB0122");
  assert.equal(result.certificate, "CN=AppPublisher CI");
  assert.equal(calls[0][1].includes("-strict"), false);
});

test("keeps generated certification artifacts inside the repository", () => {
  const root = path.resolve("/tmp/apppublisher-repository");
  assert.equal(
    safeOutputDirectory(".artifacts/android", root),
    path.join(root, ".artifacts", "android"),
  );
  assert.throws(() => safeOutputDirectory("../outside", root), /inside the repository/);
  assert.throws(() => safeOutputDirectory(".", root), /inside the repository/);
});
