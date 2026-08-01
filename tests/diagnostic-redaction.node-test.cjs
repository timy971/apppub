const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REDACTED,
  sanitizeDiagnosticValue,
  summarizeIpcArgs,
} = require("../electron/diagnostic-redaction.cjs");

const SENTINEL = "never-write-this-secret";

test("redacts the value sent to secrets:set", () => {
  const result = summarizeIpcArgs("secrets:set", ["profile-1", "storepass", SENTINEL]);
  assert.equal(result[2], REDACTED);
  assert.equal(JSON.stringify(result).includes(SENTINEL), false);
});

test("redacts signing passwords recursively", () => {
  const result = summarizeIpcArgs("signing:keystoreCreate", [
    {
      alias: "upload",
      storepass: SENTINEL,
      keypass: SENTINEL,
      keystorePath: "/tmp/release.jks",
    },
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(SENTINEL), false);
  assert.equal(result[0].storepass, REDACTED);
  assert.equal(result[0].keypass, REDACTED);
  assert.equal(result[0].alias, "upload");
});

test("omits the complete Gradle environment", () => {
  const result = summarizeIpcArgs("exec:run", [
    {
      cmd: "./gradlew",
      args: ["bundleRelease"],
      cwd: "/project/android",
      env: { ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD: SENTINEL },
    },
    "stream-id",
  ]);
  assert.equal(JSON.stringify(result).includes(SENTINEL), false);
  assert.equal(result[0].env, REDACTED);
});

test("omits file contents while preserving useful metadata", () => {
  const textResult = summarizeIpcArgs("fs:writeText", ["/project/file.txt", SENTINEL]);
  const jsonResult = summarizeIpcArgs("fs:writeJson", ["/project/file.json", { token: SENTINEL }]);
  assert.deepEqual(textResult[1], { omitted: true, length: SENTINEL.length });
  assert.equal(JSON.stringify(textResult).includes(SENTINEL), false);
  assert.equal(JSON.stringify(jsonResult).includes(SENTINEL), false);
});

test("redacts sensitive keys in generic diagnostic objects", () => {
  const result = sanitizeDiagnosticValue({
    profileId: "profile-1",
    accessToken: SENTINEL,
    nested: { api_key: SENTINEL },
  });
  assert.equal(result.profileId, "profile-1");
  assert.equal(result.accessToken, REDACTED);
  assert.equal(result.nested.api_key, REDACTED);
  assert.equal(JSON.stringify(result).includes(SENTINEL), false);
});
