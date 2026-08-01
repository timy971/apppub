const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { ensureGradleWrapperExecutable } = require("../electron/gradle-executable.cjs");

function resolverFor(root) {
  const realRoot = fs.realpathSync(root);
  return (inputPath) => {
    try {
      const real = fs.realpathSync(inputPath);
      const rel = path.relative(realRoot, real);
      return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel)) ? real : null;
    } catch {
      return null;
    }
  };
}

test("makes the local Unix Gradle wrapper executable", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-gradle-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const androidDir = path.join(root, "android");
  const wrapper = path.join(androidDir, "gradlew");
  fs.mkdirSync(androidDir, { recursive: true });
  fs.writeFileSync(wrapper, "#!/bin/sh\nexit 0\n", { mode: 0o644 });

  const result = ensureGradleWrapperExecutable(root, resolverFor(root), "darwin");

  assert.equal(result.ok, true);
  assert.doesNotThrow(() => fs.accessSync(wrapper, fs.constants.X_OK));
});

test("refuses a project outside the approved root", (t) => {
  const approved = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-approved-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-outside-"));
  t.after(() => fs.rmSync(approved, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

  const result = ensureGradleWrapperExecutable(outside, resolverFor(approved), "darwin");

  assert.deepEqual(result, { ok: false, errorCode: "project-not-authorized" });
});
