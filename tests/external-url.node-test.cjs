const assert = require("node:assert/strict");
const test = require("node:test");

const { sanitizeExternalUrl } = require("../electron/external-url.cjs");

test("accepts the official publishing consoles", () => {
  assert.equal(
    sanitizeExternalUrl("https://play.google.com/console/"),
    "https://play.google.com/console/",
  );
  assert.equal(
    sanitizeExternalUrl("https://appstoreconnect.apple.com/apps"),
    "https://appstoreconnect.apple.com/apps",
  );
});

test("accepts known source repositories", () => {
  assert.equal(
    sanitizeExternalUrl("https://github.com/timy971/apppub"),
    "https://github.com/timy971/apppub",
  );
});

test("rejects unsafe protocols, credentials and unknown hosts", () => {
  assert.equal(sanitizeExternalUrl("file:///etc/passwd"), null);
  assert.equal(sanitizeExternalUrl("https://user:pass@github.com/project"), null);
  assert.equal(sanitizeExternalUrl("https://example.com/redirect"), null);
  assert.equal(sanitizeExternalUrl("not a url"), null);
});
