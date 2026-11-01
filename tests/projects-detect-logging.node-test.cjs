const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("projects:detect uses the existing diagWrite logger and never an undefined diag helper", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
  const start = source.indexOf('ipcMain.handle("projects:detect"');
  const end = source.indexOf('ipcMain.handle("projects:scan"', start);
  assert.ok(start >= 0 && end > start, "projects:detect handler doit être présent");
  const handler = source.slice(start, end);

  assert.match(handler, /diagWrite\(\{/);
  assert.doesNotMatch(handler, /\bdiag\(/);
  assert.match(handler, /message: "projects:detect android readiness"/);
});
