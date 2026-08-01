const assert = require("node:assert/strict");
const test = require("node:test");

const { SigningSessionRegistry } = require("../electron/signing-session.cjs");

test("a signing session is single-use and bound to its renderer and project", () => {
  const registry = new SigningSessionRegistry({
    randomBytes: () => Buffer.alloc(16, 1),
  });
  const id = registry.create(7, "/project/one", { SECRET: "hidden" });
  assert.equal(registry.consume(8, id, "/project/one"), null);
  assert.equal(registry.consume(7, id, "/project/two"), null);
  assert.deepEqual(registry.consume(7, id, "/project/one"), { SECRET: "hidden" });
  assert.equal(registry.consume(7, id, "/project/one"), null);
});

test("expired signing sessions cannot be consumed", () => {
  let now = 1_000;
  const registry = new SigningSessionRegistry({
    now: () => now,
    ttlMs: 100,
    randomBytes: () => Buffer.alloc(16, 2),
  });
  const id = registry.create(1, "/project", { SECRET: "hidden" });
  now += 101;
  assert.equal(registry.consume(1, id, "/project"), null);
});
