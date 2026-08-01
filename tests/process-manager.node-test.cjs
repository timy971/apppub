const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ExecutionRegistry,
  isValidExecutionId,
  normalizeSpawnCommand,
  terminateProcessTree,
} = require("../electron/process-manager.cjs");

test("normalizes package and Gradle commands on Windows", () => {
  assert.equal(normalizeSpawnCommand("npm", "win32"), "npm.cmd");
  assert.equal(normalizeSpawnCommand("npx", "win32"), "npx.cmd");
  assert.equal(normalizeSpawnCommand("gradle", "win32"), "gradle.bat");
  assert.equal(normalizeSpawnCommand("node", "win32"), "node");
  assert.equal(normalizeSpawnCommand("npm", "darwin"), "npm");
});

test("accepts only opaque execution identifiers", () => {
  assert.equal(isValidExecutionId("exec_12345678"), true);
  assert.equal(isValidExecutionId("short"), false);
  assert.equal(isValidExecutionId("../../process"), false);
});

test("cancels only an execution owned by the requesting renderer", () => {
  const terminated = [];
  let aborted = false;
  const registry = new ExecutionRegistry({
    terminate: (child) => {
      terminated.push(child.pid);
      return true;
    },
  });
  const child = { pid: 42 };

  assert.equal(
    registry.register(7, "exec_12345678", child, () => (aborted = true)),
    true,
  );
  assert.equal(registry.cancel(8, "exec_12345678"), false);
  assert.equal(aborted, false);
  assert.deepEqual(terminated, []);
  assert.equal(registry.cancel(7, "exec_12345678"), true);
  assert.equal(aborted, true);
  assert.deepEqual(terminated, [42]);
});

test("releasing an execution makes a later cancellation a no-op", () => {
  const registry = new ExecutionRegistry({ terminate: () => true });
  assert.equal(registry.register(2, "exec_abcdefgh", { pid: 99 }), true);
  assert.equal(registry.release(2, "exec_abcdefgh"), true);
  assert.equal(registry.cancel(2, "exec_abcdefgh"), false);
});

test("terminates a Unix process group and schedules a forced stop", () => {
  const signals = [];
  const timers = [];
  const child = { pid: 321, exitCode: null, kill: () => false };
  const result = terminateProcessTree(child, {
    platform: "darwin",
    killProcess: (pid, signal) => signals.push([pid, signal]),
    setTimer: (fn, ms) => {
      timers.push(ms);
      fn();
      return { unref() {} };
    },
  });

  assert.equal(result, true);
  assert.deepEqual(signals, [
    [-321, "SIGTERM"],
    [-321, "SIGKILL"],
  ]);
  assert.deepEqual(timers, [3000]);
});
