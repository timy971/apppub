const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  ensureGoogleOAuthBuildConfig,
} = require("../scripts/google-oauth-build-config.cjs");

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-build-"));
  return {
    dir,
    outputPath: path.join(dir, "build", "google-play-oauth.json"),
    publicClientPath: path.join(dir, "build", "google-play-oauth-client.json"),
  };
}

function writePublicClient(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    JSON.stringify({ installed: { client_id: "desktop.apps.googleusercontent.com" } }),
    "utf8",
  );
}

test("a distributable build refuses a public client id without client secret", () => {
  const paths = tempPaths();
  try {
    writePublicClient(paths.publicClientPath);
    assert.throws(
      () =>
        ensureGoogleOAuthBuildConfig({
          required: true,
          requireClientSecret: true,
          outputPath: paths.outputPath,
          publicClientPath: paths.publicClientPath,
          env: {},
        }),
      /Client secret OAuth Google AppPublisher absent/,
    );
  } finally {
    fs.rmSync(paths.dir, { recursive: true, force: true });
  }
});

test("a distributable build combines versioned client id with injected secret", () => {
  const paths = tempPaths();
  try {
    writePublicClient(paths.publicClientPath);
    const result = ensureGoogleOAuthBuildConfig({
      required: true,
      requireClientSecret: true,
      outputPath: paths.outputPath,
      publicClientPath: paths.publicClientPath,
      env: { APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET: "desktop-secret" },
    });
    assert.equal(result.clientId, "desktop.apps.googleusercontent.com");
    assert.equal(result.hasClientSecret, true);
    assert.equal(result.source, "versioned-client-id+injected-secret");
    assert.deepEqual(JSON.parse(fs.readFileSync(paths.outputPath, "utf8")), {
      installed: {
        client_id: "desktop.apps.googleusercontent.com",
        client_secret: "desktop-secret",
      },
    });
  } finally {
    fs.rmSync(paths.dir, { recursive: true, force: true });
  }
});

test("an injected complete config replaces a stale id-only generated file", () => {
  const paths = tempPaths();
  try {
    fs.mkdirSync(path.dirname(paths.outputPath), { recursive: true });
    fs.writeFileSync(
      paths.outputPath,
      JSON.stringify({ installed: { client_id: "stale.apps.googleusercontent.com" } }),
      "utf8",
    );
    const result = ensureGoogleOAuthBuildConfig({
      required: true,
      requireClientSecret: true,
      outputPath: paths.outputPath,
      publicClientPath: paths.publicClientPath,
      env: {
        APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID: "fresh.apps.googleusercontent.com",
        APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET: "fresh-secret",
      },
    });
    assert.equal(result.clientId, "fresh.apps.googleusercontent.com");
    assert.equal(result.hasClientSecret, true);
  } finally {
    fs.rmSync(paths.dir, { recursive: true, force: true });
  }
});
