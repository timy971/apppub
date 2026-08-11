const fs = require("fs");
const { JWT } = require("google-auth-library");

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API_ROOT = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const UPLOAD_ROOT = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const INTERNAL_TRACK = "internal";

class GooglePlayError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "GooglePlayError";
    this.code = code;
    this.status = options.status;
    this.reason = options.reason;
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
  let code = "google-play-error";
  if (
    reason === "apkUpgradeVersionConflict" ||
    reason === "apkNotificationMessageKeyUpgradeVersionConflict"
  ) {
    code = "version-already-used";
  } else if (reason === "CHANGES_ALREADY_IN_REVIEW") {
    code = "changes-in-review";
  } else if (status === 401) code = "credentials-rejected";
  else if (status === 403) code = "permission-denied";
  else if (status === 404) code = "app-not-found";
  return new GooglePlayError(code, safeGoogleMessage(payload, `Google Play a répondu ${status}.`), {
    status,
    reason,
  });
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
    this.fs = options.fsModule ?? fs;
    if (typeof this.fetch !== "function") throw new Error("fetch indisponible");
  }

  async accessToken(credentials) {
    const client = this.jwtFactory(credentials);
    let token;
    try {
      const result = await client.getAccessToken();
      token = typeof result === "string" ? result : result?.token;
    } catch {
      throw new GooglePlayError(
        "credentials-rejected",
        "Google a refusé l'authentification du compte de service.",
      );
    }
    if (!token) {
      throw new GooglePlayError(
        "credentials-rejected",
        "Google n'a pas fourni de jeton d'accès au compte de service.",
      );
    }
    return token;
  }

  async request(url, token, options = {}) {
    let response;
    try {
      response = await this.fetch(url, {
        ...options,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers ?? {}),
        },
        signal: options.signal ?? AbortSignal.timeout(120_000),
      });
    } catch (error) {
      if (error instanceof GooglePlayError) throw error;
      throw new GooglePlayError(
        "network-error",
        "La connexion à Google Play a échoué. Vérifiez votre accès Internet.",
      );
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
        { method: "DELETE" },
      );
    } catch {
      // Nettoyage de meilleure intention : l'édition expire également côté Google.
    }
  }

  async testConnection(credentialsInput, packageNameInput) {
    const credentials = validateServiceAccountCredentials(credentialsInput);
    const packageName = normalizePackageName(packageNameInput);
    const token = await this.accessToken(credentials);
    const editId = await this.insertEdit(packageName, token);
    await this.deleteEdit(packageName, editId, token);
    return { ok: true, serviceAccountEmail: credentials.client_email, packageName };
  }

  async publishInternal(input, onStep = () => {}) {
    const credentials = validateServiceAccountCredentials(input.credentials);
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
      onStep("upload-bundle");
      const bundle = await this.request(
        `${UPLOAD_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}/bundles?uploadType=media`,
        token,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: this.fs.createReadStream(input.aabPath),
          duplex: "half",
        },
      );
      if (!Number.isSafeInteger(bundle.versionCode) || bundle.versionCode <= 0) {
        throw new GooglePlayError(
          "invalid-response",
          "Google Play n'a pas reconnu la version de l'AAB.",
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
        },
      );

      onStep("validate-edit");
      await this.request(
        `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}:validate`,
        token,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      );

      onStep("commit-edit");
      try {
        await this.request(
          `${API_ROOT}/applications/${encode(packageName)}/edits/${encode(editId)}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`,
          token,
          { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        );
      } catch (error) {
        if (error?.code === "network-error") {
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
        serviceAccountEmail: credentials.client_email,
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
  normalizeLocale,
  normalizeNotes,
  normalizePackageName,
  validateServiceAccountCredentials,
};
