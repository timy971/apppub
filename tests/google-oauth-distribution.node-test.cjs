const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { GooglePlayOAuth, loadGooglePlayOAuthConfig } = require("../electron/google-play-oauth.cjs");
const {
  ensureGoogleOAuthBuildConfig,
  resolveGoogleOAuthBuildConfig,
} = require("../scripts/google-oauth-build-config.cjs");

test("a distributed build needs only the public desktop Client ID", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-build-"));
  try {
    const outputPath = path.join(dir, "google-play-oauth.json");
    const result = ensureGoogleOAuthBuildConfig({
      required: true,
      outputPath,
      publicClientPath: path.join(dir, "missing-public-client.json"),
      env: {
        APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID: "apppublisher.apps.googleusercontent.com",
      },
    });

    assert.equal(result.source, "client-id");
    assert.equal(result.hasClientSecret, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
      installed: { client_id: "apppublisher.apps.googleusercontent.com" },
    });

    const runtimeConfig = loadGooglePlayOAuthConfig({
      env: {},
      resourcesPath: dir,
    });
    assert.equal(runtimeConfig.clientId, "apppublisher.apps.googleusercontent.com");
    assert.equal(runtimeConfig.clientSecret, "");
    assert.equal(
      new GooglePlayOAuth(runtimeConfig, {
        persistentConfigPath: null,
        interactiveConfigurationAvailable: false,
      }).available(),
      true,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("uses the versioned public AppPublisher Client ID without copying a secret", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-versioned-"));
  try {
    const outputPath = path.join(dir, "generated", "google-play-oauth.json");
    const publicClientPath = path.join(dir, "google-play-oauth-client.json");
    fs.writeFileSync(
      publicClientPath,
      JSON.stringify({
        installed: {
          client_id: "versioned.apps.googleusercontent.com",
          client_secret: "must-never-be-copied",
        },
      }),
      "utf8",
    );

    const result = ensureGoogleOAuthBuildConfig({
      required: true,
      outputPath,
      publicClientPath,
      env: {},
    });

    assert.equal(result.source, "versioned-public-client-id");
    assert.equal(result.hasClientSecret, false);
    assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf8")), {
      installed: { client_id: "versioned.apps.googleusercontent.com" },
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("legacy base64 OAuth JSON remains supported for release compatibility", () => {
  const encoded = Buffer.from(
    JSON.stringify({
      installed: {
        client_id: "legacy.apps.googleusercontent.com",
        client_secret: "legacy-secret",
      },
    }),
  ).toString("base64");
  const resolved = resolveGoogleOAuthBuildConfig({ GOOGLE_PLAY_OAUTH_JSON_BASE64: encoded });
  assert.equal(resolved.source, "legacy-base64-json");
  assert.equal(resolved.config.installed.client_id, "legacy.apps.googleusercontent.com");
  assert.equal(resolved.config.installed.client_secret, "legacy-secret");
});

test("a private beta cannot be packaged without AppPublisher OAuth identity", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-missing-"));
  try {
    assert.throws(
      () =>
        ensureGoogleOAuthBuildConfig({
          required: true,
          outputPath: path.join(dir, "google-play-oauth.json"),
          publicClientPath: path.join(dir, "missing-public-client.json"),
          env: {},
        }),
      /Client OAuth Google AppPublisher absent/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("normal users are never sent to a file picker when the build is incomplete", async () => {
  let pickerCalled = false;
  const oauth = new GooglePlayOAuth(null, {
    persistentConfigPath: null,
    selectConfigFile: async () => {
      pickerCalled = true;
      return "/tmp/client.json";
    },
    interactiveConfigurationAvailable: false,
  });

  assert.equal(oauth.available(), false);
  await assert.rejects(
    () => oauth.ensureConfigured(),
    (error) => error?.code === "oauth-not-configured",
  );
  assert.equal(pickerCalled, false);
});
