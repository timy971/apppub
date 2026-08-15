const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  GooglePlayPublisher,
  normalizeLocale,
  normalizeNotes,
  validateOAuthCredentials,
  validateServiceAccountCredentials,
} = require("../electron/google-play-publisher.cjs");

const credentials = {
  type: "service_account",
  project_id: "publisher-project",
  private_key_id: "key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nTEST\n-----END PRIVATE KEY-----\n",
  client_email: "publisher@publisher-project.iam.gserviceaccount.com",
  client_id: "123456789",
  token_uri: "https://oauth2.googleapis.com/token",
};

function response(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return status === 204 ? "" : JSON.stringify(payload);
    },
  };
}

function publisherWith(fetchImpl, options = {}) {
  return new GooglePlayPublisher({
    fetchImpl,
    jwtFactory: () => ({
      async getAccessToken() {
        return "short-lived-token";
      },
    }),
    fsModule: {
      statSync: fs.statSync,
    },
    readFileImpl: (filePath) => fs.promises.readFile(filePath),
    ...options,
  });
}

test("accepts only a Google service-account credential document", () => {
  const clean = validateServiceAccountCredentials(credentials);
  assert.equal(clean.client_email, credentials.client_email);
  assert.equal("client_secret" in clean, false);
  assert.throws(
    () => validateServiceAccountCredentials({ ...credentials, type: "authorized_user" }),
    /compte de service/,
  );
  assert.throws(
    () => validateServiceAccountCredentials({ ...credentials, token_uri: "https://example.test" }),
    /authentification/,
  );
});

test("accepts an OAuth refresh token without exposing it as a service-account key", () => {
  const clean = validateOAuthCredentials({
    type: "authorized_user",
    client_id: "desktop-client.apps.googleusercontent.com",
    client_secret: "desktop-secret",
    refresh_token: "refresh-token",
    account_email: "tim@example.com",
  });
  assert.equal(clean.account_email, "tim@example.com");
  assert.equal("private_key" in clean, false);
  assert.throws(() => validateOAuthCredentials({ ...clean, refresh_token: "" }), /incomplète/);
});

test("uses OAuth refresh credentials for the same restricted Play connection check", async () => {
  const calls = [];
  const api = new GooglePlayPublisher({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/edits")) return response(200, { id: "edit-oauth" });
      if (url.endsWith("/edits/edit-oauth")) return response(204);
      throw new Error(`Unexpected URL: ${url}`);
    },
    oauthFactory: () => ({
      async getAccessToken() {
        return { token: "oauth-access-token" };
      },
    }),
  });
  const result = await api.testConnection(
    {
      type: "authorized_user",
      client_id: "desktop-client.apps.googleusercontent.com",
      refresh_token: "refresh-token",
      account_email: "tim@example.com",
    },
    "app.cranioscan.android",
  );
  assert.equal(result.accountEmail, "tim@example.com");
  assert.equal(result.authMode, "oauth");
  assert.equal(calls[0].options.headers.Authorization, "Bearer oauth-access-token");
});

test("normalizes Play locales and enforces the 500-character release-note limit", () => {
  assert.equal(normalizeLocale("fr"), "fr-FR");
  assert.equal(normalizeLocale("en"), "en-US");
  assert.equal(normalizeLocale("de-DE"), "de-DE");
  assert.equal(normalizeNotes(" Une correction importante. "), "Une correction importante.");
  assert.throws(() => normalizeNotes(""), /obligatoires/);
  assert.throws(() => normalizeNotes("x".repeat(501)), /500/);
});

test("keeps a valid Google connection when the public Play application is not initialized", async () => {
  const api = publisherWith(async (url) => {
    assert.match(url, /applications\/app\.cranioscan\.android\/edits$/);
    return response(404, { error: { message: "Package not found" } });
  });

  const result = await api.prepareConnection(credentials, "app.cranioscan.android");

  assert.equal(result.ok, true);
  assert.equal(result.accountEmail, credentials.client_email);
  assert.equal(result.verified, false);
  assert.equal(result.initializationRequired, true);
});

test("marks an existing Play application ready during connection", async () => {
  const api = publisherWith(async (url) => {
    if (url.endsWith("/edits")) return response(200, { id: "edit-ready" });
    if (url.endsWith("/edits/edit-ready")) return response(204);
    throw new Error(`Unexpected URL: ${url}`);
  });

  const result = await api.prepareConnection(credentials, "app.cranioscan.android");

  assert.equal(result.verified, true);
  assert.equal(result.initializationRequired, false);
});

test("publishes one AAB only to internal, validates it, then commits without cancelling a review", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-google-play-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const aabPath = path.join(root, "release.aab");
  fs.writeFileSync(aabPath, "signed-aab-fixture");
  const calls = [];
  const timeouts = [];
  const api = publisherWith(
    async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/edits")) return response(200, { id: "edit-123" });
      if (url.includes("uploadType=media")) return response(200, { versionCode: 42 });
      if (url.endsWith("/tracks/internal")) return response(200, { track: "internal" });
      if (url.endsWith("edit-123:validate")) return response(200, { id: "edit-123" });
      if (url.includes("edit-123:commit?")) return response(200, { id: "edit-123" });
      throw new Error(`Unexpected URL: ${url}`);
    },
    {
      timeoutSignalFactory: (timeoutMs) => {
        timeouts.push(timeoutMs);
        return AbortSignal.timeout(timeoutMs);
      },
    },
  );

  const result = await api.publishInternal({
    credentials,
    packageName: "app.cranioscan.android",
    aabPath,
    notes: "Correction de stabilité.",
    language: "fr-FR",
    releaseName: "CranioScan 1.0.1 (42)",
  });

  assert.equal(result.ok, true);
  assert.equal(result.track, "internal");
  assert.equal(result.versionCode, 42);
  assert.equal(calls.length, 5);
  assert.match(calls[1].url, /\/upload\/androidpublisher\/v3\//);
  assert.equal(calls[1].options.headers["Content-Length"], String(fs.statSync(aabPath).size));
  assert.ok(Buffer.isBuffer(calls[1].options.body));
  assert.equal("duplex" in calls[1].options, false);
  assert.equal("timeoutMs" in calls[1].options, false);
  assert.equal("phase" in calls[1].options, false);
  assert.equal(timeouts[1], 10 * 60_000);
  assert.match(calls[2].url, /\/tracks\/internal$/);
  const trackBody = JSON.parse(calls[2].options.body);
  assert.deepEqual(trackBody.releases[0].versionCodes, ["42"]);
  assert.equal(trackBody.releases[0].status, "completed");
  assert.equal(trackBody.releases[0].releaseNotes[0].language, "fr-FR");
  assert.match(calls[4].url, /changesInReviewBehavior=ERROR_IF_IN_REVIEW$/);
  assert.equal(
    calls.some((call) => /tracks\/(alpha|beta|production)/.test(call.url)),
    false,
  );
});

test("deletes the uncommitted edit when Google rejects the track update", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-google-play-cleanup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const aabPath = path.join(root, "release.aab");
  fs.writeFileSync(aabPath, "signed-aab-fixture");
  const calls = [];
  const api = publisherWith(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/edits")) return response(200, { id: "edit-cleanup" });
    if (url.includes("uploadType=media")) return response(200, { versionCode: 7 });
    if (url.endsWith("/tracks/internal")) {
      return response(403, {
        error: { message: "Permission denied", errors: [{ reason: "forbidden" }] },
      });
    }
    if (url.endsWith("/edits/edit-cleanup") && options.method === "DELETE") return response(204);
    throw new Error(`Unexpected URL: ${url}`);
  });

  await assert.rejects(
    api.publishInternal({
      credentials,
      packageName: "app.cranioscan.android",
      aabPath,
      notes: "Test cleanup.",
      language: "fr-FR",
      releaseName: "CranioScan 1.0.0 (7)",
    }),
    (error) => error.code === "permission-denied",
  );
  assert.equal(calls.at(-1).options.method, "DELETE");
  assert.match(calls.at(-1).url, /\/edits\/edit-cleanup$/);
  assert.equal(
    calls.some((call) => call.url.includes(":commit")),
    false,
  );
});

test("connection check creates and immediately deletes a disposable edit", async () => {
  const calls = [];
  const api = publisherWith(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/edits")) return response(200, { id: "edit-check" });
    if (url.endsWith("/edits/edit-check")) return response(204);
    throw new Error(`Unexpected URL: ${url}`);
  });
  const result = await api.testConnection(credentials, "app.cranioscan.android");
  assert.equal(result.ok, true);
  assert.deepEqual(
    calls.map((call) => call.options.method),
    ["POST", "DELETE"],
  );
});

test("classifies a reused versionCode before the generic 403 permission error", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-google-play-version-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const aabPath = path.join(root, "release.aab");
  fs.writeFileSync(aabPath, "signed-aab-fixture");
  const api = publisherWith(async (url, options) => {
    if (url.endsWith("/edits")) return response(200, { id: "edit-version" });
    if (url.includes("uploadType=media")) {
      return response(403, {
        error: {
          message: "Version code has already been used.",
          errors: [{ reason: "apkUpgradeVersionConflict" }],
        },
      });
    }
    if (url.endsWith("/edits/edit-version") && options.method === "DELETE") {
      return response(204);
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  await assert.rejects(
    api.publishInternal({
      credentials,
      packageName: "app.cranioscan.android",
      aabPath,
      notes: "Version déjà utilisée.",
      language: "fr-FR",
      releaseName: "CranioScan 1.0.0 (7)",
    }),
    (error) => error.code === "version-already-used",
  );
});

test("marks a network interruption during commit as an unknown outcome", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-google-play-commit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const aabPath = path.join(root, "release.aab");
  fs.writeFileSync(aabPath, "signed-aab-fixture");
  const calls = [];
  const api = publisherWith(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/edits")) return response(200, { id: "edit-commit" });
    if (url.includes("uploadType=media")) return response(200, { versionCode: 99 });
    if (url.endsWith("/tracks/internal")) return response(200, { track: "internal" });
    if (url.endsWith("edit-commit:validate")) return response(200, { id: "edit-commit" });
    if (url.includes("edit-commit:commit?")) throw new Error("socket closed");
    if (url.endsWith("/edits/edit-commit") && options.method === "DELETE") return response(204);
    throw new Error(`Unexpected URL: ${url}`);
  });
  await assert.rejects(
    api.publishInternal({
      credentials,
      packageName: "app.cranioscan.android",
      aabPath,
      notes: "Résultat ambigu.",
      language: "fr-FR",
      releaseName: "CranioScan 1.0.0 (99)",
    }),
    (error) => error.code === "commit-outcome-unknown",
  );
  assert.equal(calls.at(-1).options.method, "DELETE");
});

test("reports an AAB upload interruption without blaming the user's Internet access", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-google-play-upload-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const aabPath = path.join(root, "release.aab");
  fs.writeFileSync(aabPath, "signed-aab-fixture");
  const api = publisherWith(async (url, options) => {
    if (url.endsWith("/edits")) return response(200, { id: "edit-upload" });
    if (url.includes("uploadType=media")) {
      const failure = new TypeError("fetch failed");
      failure.cause = { code: "ECONNRESET" };
      throw failure;
    }
    if (url.endsWith("/edits/edit-upload") && options.method === "DELETE") return response(204);
    throw new Error(`Unexpected URL: ${url}`);
  });

  await assert.rejects(
    api.publishInternal({
      credentials,
      packageName: "app.cranioscan.android",
      aabPath,
      notes: "Envoi interrompu.",
      language: "fr-FR",
      releaseName: "CranioScan 1.0.0 (101)",
    }),
    (error) =>
      error.code === "network-error" &&
      error.phase === "upload-bundle" &&
      error.causeCode === "ECONNRESET" &&
      /sans recréer la connexion Google/.test(error.message),
  );
});
