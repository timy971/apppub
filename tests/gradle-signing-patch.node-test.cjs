const assert = require("node:assert/strict");
const test = require("node:test");

const {
  MARKER_BEGIN,
  MARKER_END,
  buildPatchedGradle,
} = require("../electron/gradle-signing-patch.cjs");

test("builds the managed signing block in the main process and stays idempotent", () => {
  const first = buildPatchedGradle("android { compileSdkVersion 35 }\n");
  assert.equal(first.ok, true);
  assert.equal(first.changed, true);
  assert.match(first.content, /appPublisherRelease/);

  const second = buildPatchedGradle(first.content);
  assert.deepEqual(second, { ok: true, changed: false, content: first.content });
});

test("refuses a truncated or duplicated managed block", () => {
  assert.deepEqual(buildPatchedGradle(`android {}\n${MARKER_BEGIN}\n`), {
    ok: false,
    errorCode: "managed-block-corrupt",
  });
  assert.deepEqual(
    buildPatchedGradle(`${MARKER_BEGIN}\n${MARKER_END}\n${MARKER_BEGIN}\n${MARKER_END}`),
    { ok: false, errorCode: "managed-block-corrupt" },
  );
});
