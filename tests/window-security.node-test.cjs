const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const { isAllowedAppNavigation } = require("../electron/window-security.cjs");

test("production navigation stays on the packaged index file", () => {
  const indexPath = path.resolve("/tmp/AppPublisher/dist/index.html");
  const indexUrl = pathToFileURL(indexPath).toString();
  assert.equal(isAllowedAppNavigation(`${indexUrl}#/projects`, { indexPath }), true);
  assert.equal(
    isAllowedAppNavigation(
      pathToFileURL(path.resolve("/tmp/AppPublisher/dist/other.html")).toString(),
      {
        indexPath,
      },
    ),
    false,
  );
  assert.equal(isAllowedAppNavigation("https://example.com/", { indexPath }), false);
});

test("development navigation is restricted to the configured origin", () => {
  const devUrl = "http://localhost:8080";
  assert.equal(isAllowedAppNavigation("http://localhost:8080/#/setup", { devUrl }), true);
  assert.equal(isAllowedAppNavigation("http://127.0.0.1:8080/", { devUrl }), false);
  assert.equal(isAllowedAppNavigation("https://localhost:8080/", { devUrl }), false);
});
