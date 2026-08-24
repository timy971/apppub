const fs = require("fs");
const { JWT, OAuth2Client } = require("google-auth-library");

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD_ROOT = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const INTERNAL_TRACK = "internal";
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const AAB_UPLOAD_TIMEOUT_MS = 10 * 60_000;

class GooglePlayError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "GooglePlayError";
    this.code = code;
    this.status = options.status;
    this.reason = options.reason;
    this.phase = options.phase;
    this.causeCode = options.causeCode;
    this.attemptedVersionCode = options.attemptedVersionCode;
    this.existingVersionCode = options.existingVersionCode;
    this.minimumVersionCode = options.minimumVersionCode;
  }
}

function validateServiceAccountCredentials(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GooglePlayError("credentials-invalid", "Le fichier JSON est invalide.");
  }
  if (value.type !== "service_account") {
    throw new GooglePlayError(
      "credentials-invalid",
      "Ce fichier n'est pas une clé de compte de service Google.",
    );
  }
  if (
    typeof value.client_email !== "string" ||
    !value.client_email.endsWith(".gserviceaccount.com")
  ) {
    throw new GooglePlayError(
      "credentials-invalid",
      "L'adresse du compte de service est invalide.",
    );
  }
  if (
    typeof value.private_key !== "string" ||
    !value.private_key.includes("-----BEGIN PRIVATE KEY-----") ||
    !value.private_key.includes("-----END PRIVATE KEY-----")
  ) {
    throw new GooglePlayError(
      "credentials-invalid",
      "La clé privée du compte de service est invalide.",
    );
  }
  if (value.token_uri !== TOKEN_URI) {
    throw new GooglePlayError(
      "credentials-invalid",
      "L'adresse d'authentification de cette clé Google n'est pas prise en charge.",
    );
  }
  return {
    type: "service_account",
    project_id: typeof value.project_id === "string" ? value.project_id : undefined,
    private_key_id: typeof value.private_key_id === "string" ? value.private_key_id : undefined,
    private_key: value.private_key,
    client_email: value.client_email,
    client_id: typeof value.client_id === "string" ? value.client_id : undefined,
    auth_uri: typeof value.auth_uri === "string" ? value.auth_uri : undefined,
    token_uri: TOKEN_URI,
  };
}

function validateOAuthCredentials(value) {
  if (!value || typeof value !== "object" || value.type !== "authorized_user") {
    throw new GooglePlayError("credentials-invalid", "L'autorisation Google est invalide.");
  }
  if (
    typeof value.client_id !== "string" ||
    !value.client_id.endsWith(".apps.googleusercontent.com") ||
    typeof value.refresh_token !== "string" ||
    !value.refresh_token.trim() ||
    typeof value.account_email !== "string" ||
    !value.account_email.includes("@")
  ) {
    throw new GooglePlayError("credentials-invalid", "L'autorisation Google est incomplète.");
  }
  return {
    type: "authorized_user",
    client_id: value.client_id,
    client_secret: typeof value.client_secret === "string" ? value.client_secret : undefined,
    refresh_token: value.refresh_token,
    account_email: value.account_email,
  };
}

function validateGooglePlayCredentials(value) {
  return value?.type === "authorized_user"
    ? validateOAuthCredentials(value)
    : validateServiceAccountCredentials(value);
}

function credentialIdentity(credentials) {
  return credentials.type === "authorized_user"
    ? { accountEmail: credentials.account_email, authMode: "oauth" }
    : { accountEmail: credentials.client_email, authMode: "service-account" };
}

function normalizePackageName(value) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(clean)) {
    throw new GooglePlayError("package-invalid", "L'identifiant Android est invalide.");
  }
  return clean;
}

function normalizeLocale(value) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (/^[a-z]{2}-[A-Z]{2}$/.test(clean)) return clean;
  if (clean === "en") return "en-US";
  if (clean === "fr" || !clean) return "fr-FR";
  return "fr-FR";
}

function normalizeNotes(value) {
  const clean = typeof value === "string" ? value.trim() : "";
  if (!clean) throw new GooglePlayError("notes-missing", "Les notes de version sont obligatoires.");
  if ([...clean].length > 500) {
    throw new GooglePlayError("notes-too-long", "Les notes de version dépassent 500 caractères.");
  }
  return clean;
}

function encode(value) {
  return encodeURIComponent(value);
}

function safeGoogleMessage(payload, fallback) {
  const message = payload?.error?.message;
  if (typeof message !== "string" || !message.trim()) return fallback;
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 800);
}

function googleReason(payload) {
  const details = payload?.error?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (typeof detail?.reason === "string") return detail.reason;
    }
  }
  const errors = payload?.error?.errors;
  return Array.isArray(errors) && typeof errors[0]?.reason === "string"
    ? errors[0].reason
    : undefined;
}

function classifyHttpError(status, payload) {
  const reason = googleReason(payload);
  const message = safeGoogleMessage(payload, `Google Play a répondu ${status}.`);
  let code = "google-play-error";
  if (
    reason === "apkUpgradeVersionConflict" ||
    reason === "apkNotificationMessageKeyUpgradeVersionConflict" ||
    /does not allow any existing users to upgrade to the newly added (?:apks?|app bundles?)/i.test(
      message,
    )
  ) {
    code = "version-too-low";
  } else if (
    /version\s*code\b.*\balready\s+been\s+used\b/i.test(message) ||
    /\bversionCode\b.*\balready\b.*\bused\b/i.test(message)
  ) {
    code = "version-already-used";
  } else if (
    /signed with the wrong key/i.test(message) ||
    /certificate.*(?:does not match|mismatch)/i.test(message) ||
    /wrong upload (?:key|certificate)/i.test(message)
  ) {
    code = "upload-key-mismatch";
  } else if (reason === "CHANGES_ALREADY_IN_REVIEW") {
    code = "changes-in-review";
  } else if (status === 401) code = "credentials-rejected";
  else if (status === 403) code = "permission-denied";
  else if (status === 404) code = "app-not-found";
  return new GooglePlayError(code, message, {
    status,
    reason,
  });
}

function highestTrackVersionCode(payload, trackName = INTERNAL_TRACK) {
  const tracks = Array.isArray(payload?.tracks) ? payload.tracks : [];
  const track = tracks.find((candidate) => candidate?.track === trackName);
  const releases = Array.isArray(track?.releases) ? track.releases : [];
  let highest = 0;
  for (const release of releases) {
    const versionCodes = Array.isArray(release?.versionCodes) ? release.versionCodes : [];
    for (const value of versionCodes) {
      const versionCode = Number(value);
      if (Number.isSafeInteger(versionCode) && versionCode > highest) highest = versionCode;
    }
  }
  return highest;
}

function networkCauseCode(error) {
  const value = error?.cause?.code ?? error?.code ?? error?.name;
  return typeof value === "string" ? value.slice(0, 80) : undefined;
}

function classifyNetworkError(error, phase) {
  const causeCode = networkCauseCode(error);
  const timeout =
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT" ||
    causeCode === "UND_ERR_BODY_TIMEOUT" ||
    causeCode === "ETIMEDOUT";
  if (timeout) {
    return new GooglePlayError(
      "network-timeout",
      phase === "upload-bundle"
        ? "L'envoi de l'AAB a dépassé dix minutes. La release n'a pas été validée ; vous pouvez réessayer sur une connexion stable."
        : "Google Play n'a pas répondu dans le délai prévu. Vous pouvez réessayer.",
      { phase, causeCode },
    );
  }
  return new GooglePlayError(
    "network-error",
    phase === "upload-bundle"
      ? "L'envoi de l'AAB a été interrompu avant la validation de la release. Vous pouvez réessayer sans recréer la connexion Google."
      : "La communication avec Google Play a été interrompue. Vous pouvez réessayer sans vous reconnecter.",
    { phase, causeCode },
  );
}

class GooglePlayPublisher {
  constructor(options = {}) {
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.jwtFactory =
      options.jwtFactory ??
      ((credentials) =>
        new JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: [ANDROID_PUBLISHER_SCOPE],
        }));
    this.oauthFactory =
      options.oauthFactory ??
      ((credentials) => {
        const client = new OAuth2Client({
          clientId: credentials.client_id,
          clientSecret: credentials.client_secret,
        });
        client.setCredentials({ refresh_token: credentials.refresh_token });
        return client;
      });
    this.fs = options.fsModule ?? fs;
    this.readFile = options.readFileImpl ?? ((filePath) => this.fs.promises.readFile(filePath));
    this.timeoutSignal =
      options.timeoutSignalFactory ?? ((timeoutMs) => AbortSignal.timeout(timeoutMs));
    if (typeof this.fetch !== "function") throw new Error("fetch indisponible");
  }

  async accessToken(credentials) {
    const client =
      credentials.type === "authorized_user"
        ? this.oauthFactory(credentials)
        : this.jwtFactory(credentials);
    let token;
    try {
      const result = await client.getAccessToken();
      token = typeof result === "string" ? result : result?.token;
    } catch {
      throw new GooglePlayError(
        "credentials-rejected",
        "Google a refusé l'authentification du compte connecté.",
      );
    }
    if (!token) {
      throw new GooglePlayError(
        "credentials-rejected",
        "Google n'a pas fourni de jeton d'accès au compte connecté.",
      );
    }
    return token;
  }

  async request(url, token, options = {}) {
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, phase, signal, ...fetchOptions } = options;
    let response;
    try {
      response = await this.fetch(url, {
        ...fetchOptions,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(fetchOptions.headers ?? {}),
        },
        signal: signal ?? this.timeoutSignal(timeoutMs),
      });
    } catch (error) {
      if (error instanceof GooglePlayError) throw error;
      throw classifyNetworkError(error, phase);
    }
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (!response.ok) payload = {};
      }
    }
    if (!response.ok) throw classifyHttpError(response.status, payload);
    return payload;
  }

  async insertEdit(packageName, token) {
    const payload = await this.request(
      `${API_ROOT}/applications/${encode(packageName)}/edits`,
      token,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        phase: "create-edit",
      },
    );
    if (typeof payload.id !== "string" || !payload.id) {
      throw new GooglePlayError(
        "invalid-response",
        "Google Play n'a pas renvoyé d'identifiant d'édition.",
      );
    }
    return payload.id;
  }

  async deleteEdit(packageName, editId, token) {
    try {
      await this.request(
        `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}`,
        token,
        { method: "DELETE", phase: "cleanup-edit" },
      );
    } catch {
      // Nettoyage de meilleure intention : l'édition expire également côté Google.
    }
  }

  async highestExistingVersionCode(packageName, editId, token) {
    const payload = await this.request(
      `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}/tracks`,
      token,
      { method: "GET", phase: "inspect-versions" },
    );
    return highestTrackVersionCode(payload);
  }

  async testConnection(credentialsInput, packageNameInput) {
    const credentials = validateGooglePlayCredentials(credentialsInput);
    const packageName = normalizePackageName(packageNameInput);
    const token = await this.accessToken(credentials);
    const editId = await this.insertEdit(packageName, token);
    await this.deleteEdit(packageName, editId, token);
    return { ok: true, ...credentialIdentity(credentials), packageName };
  }

  /**
   * Google ne permet pas de créer une application publique avec l'API
   * Publishing. Une connexion OAuth reste néanmoins valable quand la fiche
   * n'existe pas encore : le renderer peut alors guider la création manuelle
   * sans obliger l'utilisateur à se reconnecter ensuite.
   */
  async prepareConnection(credentialsInput, packageNameInput) {
    const credentials = validateGooglePlayCredentials(credentialsInput);
    const packageName = normalizePackageName(packageNameInput);
    try {
      const verified = await this.testConnection(credentials, packageName);
      return { ...verified, verified: true, initializationRequired: false };
    } catch (error) {
      if (error instanceof GooglePlayError && error.code === "app-not-found") {
        return {
          ok: true,
          ...credentialIdentity(credentials),
          packageName,
          verified: false,
          initializationRequired: true,
        };
      }
      throw error;
    }
  }

  async publishInternal(input, onStep = () => {}) {
    const credentials = validateGooglePlayCredentials(input.credentials);
    const packageName = normalizePackageName(input.packageName);
    const notes = normalizeNotes(input.notes);
    const language = normalizeLocale(input.language);
    const stat = this.fs.statSync(input.aabPath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new GooglePlayError("aab-invalid", "Le fichier AAB est absent ou vide.");
    }

    onStep("authenticate");
    const token = await this.accessToken(credentials);
    onStep("create-edit");
    const editId = await this.insertEdit(packageName, token);
    let committed = false;
    try {
      onStep("inspect-versions");
      const highestExistingVersionCode = await this.highestExistingVersionCode(
        packageName,
        editId,
        token,
      );

      onStep("upload-bundle");
      let bundleBytes;
      try {
        bundleBytes = await this.readFile(input.aabPath);
      } catch {
        throw new GooglePlayError(
          "aab-read-failed",
          "Le fichier AAB ne peut pas être lu. Vérifiez qu'il existe toujours, puis relancez la publication.",
          { phase: "upload-bundle" },
        );
      }
      if (!Buffer.isBuffer(bundleBytes) || bundleBytes.length !== stat.size) {
        throw new GooglePlayError(
          "aab-read-failed",
          "La lecture de l'AAB est incomplète. Aucun envoi n'a été validé.",
          { phase: "upload-bundle" },
        );
      }
      const bundle = await this.request(
        `${UPLOAD_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}/bundles?uploadType=media`,
        token,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(bundleBytes.length),
          },
          body: bundleBytes,
          timeoutMs: AAB_UPLOAD_TIMEOUT_MS,
          phase: "upload-bundle",
        },
      );
      if (!Number.isSafeInteger(bundle.versionCode) || bundle.versionCode <= 0) {
        throw new GooglePlayError(
          "invalid-response",
          "Google Play n'a pas reconnu la version de l'AAB.",
        );
      }
      if (highestExistingVersionCode > 0 && bundle.versionCode <= highestExistingVersionCode) {
        const minimumVersionCode = highestExistingVersionCode + 1;
        throw new GooglePlayError(
          "version-too-low",
          `Le numéro interne ${bundle.versionCode} est trop faible. Google Play utilise déjà le numéro ${highestExistingVersionCode}. Choisissez au minimum ${minimumVersionCode}, puis recréez le fichier Android.`,
          {
            phase: "inspect-versions",
            attemptedVersionCode: bundle.versionCode,
            existingVersionCode: highestExistingVersionCode,
            minimumVersionCode,
          },
        );
      }

      onStep("update-track");
      await this.request(
        `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}/tracks/${INTERNAL_TRACK}`,
        token,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            track: INTERNAL_TRACK,
            releases: [
              {
                name: input.releaseName,
                versionCodes: [String(bundle.versionCode)],
                status: "completed",
                releaseNotes: [{ language, text: notes }],
              },
            ],
          }),
          phase: "update-track",
        },
      );

      onStep("validate-edit");
      await this.request(
        `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}:validate`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          phase: "validate-edit",
        },
      );

      onStep("commit-edit");
      try {
        await this.request(
          `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
          token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            phase: "commit-edit",
          },
        );
      } catch (error) {
        if (error?.code === "network-error" || error?.code === "network-timeout") {
          throw new GooglePlayError(
            "commit-outcome-unknown",
            "La connexion a été interrompue pendant la validation finale. La release a peut-être été publiée : vérifiez Google Play Console avant toute nouvelle tentative.",
          );
        }
        throw error;
      }
      committed = true;
      onStep("done");
      return {
        ok: true,
        packageName,
        track: INTERNAL_TRACK,
        editId,
        versionCode: bundle.versionCode,
        releaseStatus: "completed",
        ...credentialIdentity(credentials),
      };
    } finally {
      if (!committed) await this.deleteEdit(packageName, editId, token);
    }
  }
}

module.exports = {
  ANDROID_PUBLISHER_SCOPE,
  GooglePlayError,
  GooglePlayPublisher,
  INTERNAL_TRACK,
  highestTrackVersionCode,
  normalizeLocale,
  normalizeNotes,
  normalizePackageName,
  validateGooglePlayCredentials,
  validateOAuthCredentials,
  validateServiceAccountCredentials,
};
