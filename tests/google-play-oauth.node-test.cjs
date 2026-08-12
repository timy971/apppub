const assert = require("node:assert/strict");
const http = require("node:http");
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

test("completes the desktop loopback flow with state, PKCE and a verified email", async () => {
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
    return true;
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
  assert.equal(loadGooglePlayOAuthConfig({ env: {}, fsModule: { readFileSync() {} } }), null);
});
