const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { validateExecutionRequest } = require("../electron/execution-policy.cjs");
const { ProjectAccessRegistry } = require("../electron/path-security.cjs");

function policyFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-policy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  fs.mkdirSync(path.join(project, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(project, "android"), { recursive: true });
  fs.writeFileSync(path.join(project, "package.json"), "{}");
  fs.writeFileSync(path.join(project, "scripts", "version.mjs"), "");
  fs.writeFileSync(path.join(project, "android", "gradlew"), "");
  const access = new ProjectAccessRegistry({
    filePath: path.join(root, "roots.json"),
    homeDir: path.join(root, "fake-home"),
    platform: "linux",
  });
  access.approveExisting(project);
  return { access, project };
}

test("allows only the exact application workflows", (t) => {
  const { access, project } = policyFixture(t);
  assert.equal(
    validateExecutionRequest({ cmd: "npm", args: ["run", "build"], cwd: project }, access).ok,
    true,
  );
  assert.equal(
    validateExecutionRequest(
      { cmd: "node", args: ["scripts/version.mjs", "patch"], cwd: project },
      access,
    ).ok,
    true,
  );
  assert.equal(
    validateExecutionRequest({ cmd: "node", args: ["-e", "process.exit()"], cwd: project }, access)
      .ok,
    false,
  );
  assert.equal(
    validateExecutionRequest(
      { cmd: "./gradlew", args: ["clean"], cwd: path.join(project, "android") },
      access,
    ).ok,
    false,
  );
});

test("never authorizes an arbitrary executable merely because its basename is allowed", (t) => {
  const { access, project } = policyFixture(t);
  const result = validateExecutionRequest(
    { cmd: "/tmp/attacker/npm", args: ["run", "build"], cwd: project },
    access,
  );
  assert.equal(result.ok, true);
  assert.equal(result.command, "npm");
});

test("permits only the harmless adb version probe without a project cwd", () => {
  const access = { resolveExisting: () => null };
  assert.equal(validateExecutionRequest({ cmd: "adb", args: ["--version"] }, access).ok, true);
  assert.equal(validateExecutionRequest({ cmd: "adb", args: ["shell"] }, access).ok, false);
});

test("allows only the exact Android preparation commands", (t) => {
  const { access, project } = policyFixture(t);
  const android = path.join(project, "android");
  for (const request of [
    {
      cmd: "npm",
      args: ["install", "@capacitor/cli", "@capacitor/android", "@capacitor/core"],
      cwd: project,
    },
    { cmd: "pnpm", args: ["run", "build"], cwd: project },
    { cmd: "yarn", args: ["build"], cwd: project },
    { cmd: "bun", args: ["install"], cwd: project },
    { cmd: "./gradlew", args: ["assembleDebug"], cwd: android },
  ]) {
    assert.equal(validateExecutionRequest(request, access).ok, true, JSON.stringify(request));
  }
  assert.equal(
    validateExecutionRequest(
      { cmd: "npm", args: ["install", "malicious-package"], cwd: project },
      access,
    ).ok,
    false,
  );
  assert.equal(
    validateExecutionRequest(
      { cmd: "./gradlew", args: ["clean", "assembleDebug"], cwd: android },
      access,
    ).ok,
    false,
  );
});
