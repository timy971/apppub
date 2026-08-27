const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  CALLBACK_PATH,
  GooglePlayOAuth,
  cleanOAuthConfig,
  loadGooglePlayOAuthConfig,
} = require("../electron/google-play-oauth.cjs");

test("accepts only a Google installed-app OAuth client", () => {
  assert.deepEqual(
    cleanOAuthConfig({
      installed: {
        client_id: "desktop.apps.googleusercontent.com",
        client_secret: "not-a-runtime-secret",
      },
    }),
    {
      clientId: "desktop.apps.googleusercontent.com",
      clientSecret: "not-a-runtime-secret",
    },
  );
  assert.equal(cleanOAuthConfig({ client_id: "https://evil.example" }), null);
  assert.equal(CALLBACK_PATH, "/oauth2/callback");
});

test("completes the desktop loopback flow when Electron openExternal resolves with void", async () => {
  let redirectUri;
  let generated;
  let tokenOptions;
  const oauth = new GooglePlayOAuth(
    {
      client_id: "desktop.apps.googleusercontent.com",
      client_secret: "desktop-secret",
    },
    {
      timeoutMs: 2_000,
      persistentConfigPath: null,
      oauthFactory(_clientId, _clientSecret, callbackUri) {
        redirectUri = callbackUri;
        return {
          generateAuthUrl(options) {
            generated = options;
            return "https://accounts.google.com/o/oauth2/v2/auth";
          },
          async getToken(options) {
            tokenOptions = options;
            return {
              tokens: { access_token: "access-token", refresh_token: "refresh-token" },
            };
          },
        };
      },
      async fetchImpl(url, options) {
        assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
        assert.equal(options.headers.Authorization, "Bearer access-token");
        return {
          ok: true,
          async json() {
            return { email: "tim@example.com", email_verified: true };
          },
        };
      },
    },
  );

  const credentials = await oauth.authorize(async (url) => {
    assert.equal(url, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(generated.code_challenge_method, "S256");
    assert.ok(generated.code_challenge.length > 30);
    setImmediate(() => {
      http.get(`${redirectUri}?state=${generated.state}&code=authorization-code`, (response) => {
        response.resume();
      });
    });
  });

  assert.equal(credentials.type, "authorized_user");
  assert.equal(credentials.account_email, "tim@example.com");
  assert.equal(credentials.refresh_token, "refresh-token");
  assert.equal(tokenOptions.code, "authorization-code");
  assert.ok(tokenOptions.codeVerifier.length > 40);
  assert.equal(tokenOptions.redirect_uri, redirectUri);
});

test("prefers an explicit build environment and never invents an OAuth client", () => {
  const configured = loadGooglePlayOAuthConfig({
    env: {
      APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID: "env.apps.googleusercontent.com",
      APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET: "env-secret",
    },
    fsModule: {
      readFileSync() {
        throw new Error("must not read files when env is configured");
      },
    },
  });
  assert.equal(configured.clientId, "env.apps.googleusercontent.com");
  assert.equal(
    new GooglePlayOAuth(configured, { persistentConfigPath: null }).available(),
    true,
  );
  assert.equal(loadGooglePlayOAuthConfig({ env: {}, fsModule: { readFileSync() {} } }), null);
});

test("keeps a packaged OAuth config available after normalization", () => {
  const configured = loadGooglePlayOAuthConfig({
    env: {},
    resourcesPath: "/mock/resources",
    fsModule: {
      readFileSync(filePath) {
        assert.equal(filePath, "/mock/resources/google-play-oauth.json");
        return JSON.stringify({
          installed: {
            client_id: "packaged.apps.googleusercontent.com",
            client_secret: "packaged-secret",
          },
        });
      },
    },
  });

  assert.equal(
    new GooglePlayOAuth(configured, { persistentConfigPath: null }).available(),
    true,
  );
});

test("imports and persists a desktop OAuth client on first launch", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-"));
  try {
    const source = path.join(dir, "client.json");
    const persisted = path.join(dir, "user-data", "google-play-oauth.json");
    fs.writeFileSync(
      source,
      JSON.stringify({
        installed: {
          client_id: "selected.apps.googleusercontent.com",
          client_secret: "selected-secret",
        },
      }),
      "utf8",
    );

    const oauth = new GooglePlayOAuth(null, {
      persistentConfigPath: persisted,
      selectConfigFile: async () => source,
    });

    assert.equal(oauth.available(), false);
    assert.equal(await oauth.ensureConfigured(), true);
    assert.equal(oauth.available(), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(persisted, "utf8")), {
      installed: {
        client_id: "selected.apps.googleusercontent.com",
        client_secret: "selected-secret",
      },
    });

    let pickerCalled = false;
    const reloaded = new GooglePlayOAuth(null, {
      persistentConfigPath: persisted,
      selectConfigFile: async () => {
        pickerCalled = true;
        return null;
      },
    });
    assert.equal(reloaded.available(), true);
    assert.equal(pickerCalled, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a runtime JSON that is not a Google desktop OAuth client", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-oauth-invalid-"));
  try {
    const source = path.join(dir, "client.json");
    fs.writeFileSync(
      source,
      JSON.stringify({ web: { client_id: "web.apps.googleusercontent.com" } }),
      "utf8",
    );
    const oauth = new GooglePlayOAuth(null, {
      persistentConfigPath: path.join(dir, "user-data", "google-play-oauth.json"),
      selectConfigFile: async () => source,
    });
    await assert.rejects(
      () => oauth.ensureConfigured(),
      (error) => error?.code === "oauth-config-invalid",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("treats closing the first-run OAuth picker as a cancellation", async () => {
  const oauth = new GooglePlayOAuth(null, {
    persistentConfigPath: null,
    selectConfigFile: async () => null,
  });
  await assert.rejects(
    () => oauth.authorize(async () => {}),
    (error) => error?.code === "cancelled",
  );
});
