const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  guessJavaHome,
  javaEnvironment,
  javaHomeCandidates,
  validJavaHome,
} = require("../electron/android-toolchain.cjs");

function fakeJdk(root) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "java"), "#!/bin/sh\n");
  fs.writeFileSync(path.join(bin, "keytool"), "#!/bin/sh\n");
  return root;
}

test("uses a valid JAVA_HOME before any discovered fallback", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-jdk-env-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configured = fakeJdk(path.join(root, "configured"));
  const fallback = fakeJdk(path.join(root, "fallback"));

  const selected = guessJavaHome({
    platform: "darwin",
    env: { JAVA_HOME: configured },
    homedir: root,
    extraCandidates: [fallback],
  });

  assert.equal(selected, fs.realpathSync(configured));
  assert.deepEqual(
    javaEnvironment({
      platform: "darwin",
      env: { JAVA_HOME: configured },
      homedir: root,
      extraCandidates: [fallback],
    }),
    { JAVA_HOME: fs.realpathSync(configured) },
  );
});

test("falls back to a discovered JDK when JAVA_HOME is absent or invalid", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-jdk-fallback-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const invalid = path.join(root, "invalid");
  fs.mkdirSync(path.join(invalid, "bin"), { recursive: true });
  fs.writeFileSync(path.join(invalid, "bin", "java"), "#!/bin/sh\n");
  const fallback = fakeJdk(path.join(root, "android-studio-jbr"));

  const selected = guessJavaHome({
    platform: "darwin",
    env: { JAVA_HOME: invalid },
    homedir: root,
    extraCandidates: [fallback],
  });

  assert.equal(validJavaHome(invalid, { platform: "darwin" }), false);
  assert.equal(selected, fs.realpathSync(fallback));
});

test("macOS candidates include Android Studio bundled JBR without changing system settings", () => {
  const candidates = javaHomeCandidates({
    platform: "darwin",
    env: {},
    homedir: "/Users/example",
    fsModule: {
      readdirSync() {
        throw new Error("no system JDKs");
      },
    },
  });

  assert.equal(
    candidates.includes("/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
    true,
  );
  assert.equal(
    candidates.includes("/Users/example/Applications/Android Studio.app/Contents/jbr/Contents/Home"),
    true,
  );
});

test("requires both java and keytool before accepting a JDK home", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-jdk-valid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const incomplete = path.join(root, "incomplete");
  fs.mkdirSync(path.join(incomplete, "bin"), { recursive: true });
  fs.writeFileSync(path.join(incomplete, "bin", "java"), "#!/bin/sh\n");

  assert.equal(validJavaHome(incomplete, { platform: "darwin" }), false);
  fs.writeFileSync(path.join(incomplete, "bin", "keytool"), "#!/bin/sh\n");
  assert.equal(validJavaHome(incomplete, { platform: "darwin" }), true);
});
