const assert = require("node:assert/strict");
const test = require("node:test");
const { ClientAuthentication } = require("google-auth-library");
const {
  GooglePlayOAuth,
  classifyOAuthError,
} = require("../electron/google-play-oauth.cjs");

test("classifies Google invalid_client without leaking provider payloads", () => {
  const error = classifyOAuthError({
    response: {
      status: 401,
      data: {
        error: "invalid_client",
        error_description: "The OAuth client was not found.",
      },
    },
  });
  assert.equal(error.code, "credentials-rejected");
  assert.equal(error.status, 401);
  assert.equal(error.causeCode, "invalid_client");
  assert.match(error.message, /identité OAuth/i);
  assert.doesNotMatch(error.message, /secret|token/i);
});

test("classifies invalid_grant with an actionable retry", () => {
  const error = classifyOAuthError({
    response: {
      status: 400,
      data: { error: "invalid_grant", error_description: "Bad Request" },
    },
  });
  assert.equal(error.code, "credentials-rejected");
  assert.equal(error.causeCode, "invalid_grant");
  assert.match(error.message, /nouvelle autorisation/i);
});

test("classifies an OAuth network failure as a retryable network error", () => {
  const error = classifyOAuthError({ code: "ECONNRESET" });
  assert.equal(error.code, "network-error");
  assert.equal(error.phase, "oauth");
  assert.equal(error.causeCode, "ECONNRESET");
});

test("public desktop OAuth clients use no client-secret authentication", () => {
  const oauth = new GooglePlayOAuth(
    { client_id: "public.apps.googleusercontent.com" },
    { persistentConfigPath: null },
  );
  const client = oauth.oauthFactory(
    "public.apps.googleusercontent.com",
    "",
    "http://127.0.0.1:49152/oauth2/callback",
  );
  assert.equal(client.clientAuthentication, ClientAuthentication.None);
});

test("legacy desktop clients with a secret retain client-secret-post compatibility", () => {
  const oauth = new GooglePlayOAuth(
    {
      client_id: "legacy.apps.googleusercontent.com",
      client_secret: "legacy-secret",
    },
    { persistentConfigPath: null },
  );
  const client = oauth.oauthFactory(
    "legacy.apps.googleusercontent.com",
    "legacy-secret",
    "http://127.0.0.1:49152/oauth2/callback",
  );
  assert.equal(client.clientAuthentication, ClientAuthentication.ClientSecretPost);
});
