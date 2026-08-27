const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { ClientAuthentication, OAuth2Client } = require("google-auth-library");
const { GooglePlayError } = require("./google-play-publisher.cjs");

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const CALLBACK_PATH = "/oauth2/callback";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const LOCAL_CONFIG_FILENAME = "google-play-oauth.json";

function cleanOAuthConfig(value) {
  const source = value?.installed ?? value;
  const rawClientId = source?.client_id ?? source?.clientId;
  const rawClientSecret = source?.client_secret ?? source?.clientSecret;
  const clientId = typeof rawClientId === "string" ? rawClientId.trim() : "";
  const clientSecret = typeof rawClientSecret === "string" ? rawClientSecret.trim() : "";
  if (!clientId.endsWith(".apps.googleusercontent.com")) return null;
  return { clientId, clientSecret };
}

function readOAuthConfigFile(filePath, fsModule = fs) {
  if (!filePath) return null;
  try {
    return cleanOAuthConfig(JSON.parse(fsModule.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function loadGooglePlayOAuthConfig(options = {}) {
  const env = options.env ?? process.env;
  const envConfig = cleanOAuthConfig({
    client_id: env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET,
  });
  if (envConfig) return envConfig;

  const fsModule = options.fsModule ?? fs;
  const candidates = [
    options.resourcesPath && path.join(options.resourcesPath, LOCAL_CONFIG_FILENAME),
    options.appPath && path.join(options.appPath, "build", LOCAL_CONFIG_FILENAME),
    options.userDataPath && path.join(options.userDataPath, LOCAL_CONFIG_FILENAME),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const config = readOAuthConfigFile(candidate, fsModule);
    if (config) return config;
  }
  return null;
}

function defaultPersistentConfigPath() {
  try {
    const electron = require("electron");
    if (electron?.app?.getPath) {
      return path.join(electron.app.getPath("userData"), LOCAL_CONFIG_FILENAME);
    }
  } catch {
    // Node tests and non-Electron callers do not have an Electron app context.
  }
  return null;
}

function defaultInteractiveConfigurationAvailable() {
  // Le sélecteur de fichier OAuth est uniquement un outil de dépannage/dev.
  // Une build destinée à un utilisateur doit embarquer le Client ID public
  // AppPublisher et ouvrir directement le navigateur Google.
  if (process.env.APPPUBLISHER_ALLOW_OAUTH_FILE_PICKER !== "1") return false;
  try {
    const electron = require("electron");
    return typeof electron?.dialog?.showOpenDialog === "function";
  } catch {
    return false;
  }
}

async function defaultSelectConfigFile() {
  if (process.env.APPPUBLISHER_ALLOW_OAUTH_FILE_PICKER !== "1") return undefined;
  try {
    const electron = require("electron");
    if (!electron?.dialog?.showOpenDialog) return undefined;
    const result = await electron.dialog.showOpenDialog({
      title: "Choisir la configuration Google OAuth",
      buttonLabel: "Utiliser ce fichier",
      properties: ["openFile"],
      filters: [{ name: "Configuration Google OAuth", extensions: ["json"] }],
    });
    if (result.canceled) return null;
    return result.filePaths?.[0] ?? null;
  } catch {
    return undefined;
  }
}

function persistOAuthConfig(filePath, config, fsModule = fs) {
  if (!filePath || !config) return false;
  const installed = { client_id: config.clientId };
  if (config.clientSecret) installed.client_secret = config.clientSecret;
  try {
    fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
    fsModule.writeFileSync(
      filePath,
      `${JSON.stringify({ installed }, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    return true;
  } catch {
    return false;
  }
}

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function htmlResponse(success) {
  const title = success ? "Connexion réussie" : "Connexion interrompue";
  const detail = success
    ? "Vous pouvez fermer cette fenêtre et revenir dans AppPublisher."
    : "Revenez dans AppPublisher pour recommencer.";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:36rem;margin:10vh auto;padding:2rem;color:#172033}h1{font-size:1.6rem}p{line-height:1.5;color:#526079}</style></head><body><h1>${title}</h1><p>${detail}</p></body></html>`;
}

function oauthProviderPayload(error) {
  const candidates = [error?.response?.data, error?.data];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  }
  return null;
}

function oauthProviderCode(error) {
  const payload = oauthProviderPayload(error);
  const value = payload?.error;
  if (typeof value === "string" && /^[a-z0-9_.-]{1,80}$/i.test(value)) return value;
  return undefined;
}

function oauthCauseCode(error) {
  const provider = oauthProviderCode(error);
  if (provider) return provider;
  const value = error?.cause?.code ?? error?.code ?? error?.name;
  return typeof value === "string" ? value.slice(0, 80) : undefined;
}

function oauthProviderDescription(error) {
  const payload = oauthProviderPayload(error);
  const value = payload?.error_description;
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\t]+/g, " ").trim().slice(0, 280) || undefined;
}

function classifyOAuthError(error) {
  if (error instanceof GooglePlayError) return error;
  const providerCode = oauthProviderCode(error);
  const description = oauthProviderDescription(error);
  const status = Number.isFinite(Number(error?.response?.status))
    ? Number(error.response.status)
    : undefined;
  const causeCode = oauthCauseCode(error);

  if (providerCode === "invalid_client" || providerCode === "unauthorized_client") {
    return new GooglePlayError(
      "credentials-rejected",
      "Google refuse l’identité OAuth d’AppPublisher. Vérifiez dans Google Auth Platform que ce Client ID correspond bien à une application de bureau active.",
      { status, causeCode },
    );
  }
  if (providerCode === "redirect_uri_mismatch") {
    return new GooglePlayError(
      "credentials-rejected",
      "Google refuse l’adresse de retour locale d’AppPublisher. Le client OAuth doit être de type Application de bureau afin d’autoriser le retour sur 127.0.0.1.",
      { status, causeCode },
    );
  }
  if (providerCode === "invalid_grant") {
    return new GooglePlayError(
      "credentials-rejected",
      "Google a refusé le code d’autorisation. Fermez l’onglet Google puis relancez « Se connecter avec Google » pour générer une nouvelle autorisation.",
      { status, causeCode },
    );
  }
  if (providerCode === "access_denied") {
    return new GooglePlayError(
      "credentials-rejected",
      description && /test|access|autor|developer|utilisateur|user/i.test(description)
        ? `Google n’autorise pas ce compte pour l’application OAuth AppPublisher. ${description}`
        : "Google n’autorise pas ce compte pour AppPublisher. Si l’application OAuth est encore en mode Test, ajoutez ce compte dans Google Auth Platform > Audience > Utilisateurs de test.",
      { status, causeCode },
    );
  }

  const networkCodes = new Set([
    "AbortError",
    "TimeoutError",
    "ECONNRESET",
    "ECONNREFUSED",
    "ENETUNREACH",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
  ]);
  if (!providerCode && (networkCodes.has(causeCode) || !error?.response)) {
    return new GooglePlayError(
      "network-error",
      "La communication avec Google pendant la connexion a été interrompue. Vérifiez Internet puis réessayez.",
      { status, causeCode, phase: "oauth" },
    );
  }

  return new GooglePlayError(
    "credentials-rejected",
    description
      ? `Google a refusé la connexion OAuth : ${description}`
      : "Google a refusé la connexion OAuth. AppPublisher a conservé le code technique sans exposer vos jetons ; réessayez puis consultez le journal de support si le problème persiste.",
    { status, causeCode },
  );
}

class GooglePlayOAuth {
  constructor(config, options = {}) {
    this.config = cleanOAuthConfig(config);
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.createServer = options.createServer ?? http.createServer;
    this.oauthFactory =
      options.oauthFactory ??
      ((clientId, clientSecret, redirectUri) =>
        new OAuth2Client({
          clientId,
          clientSecret: clientSecret || undefined,
          redirectUri,
          clientAuthentication: clientSecret
            ? ClientAuthentication.ClientSecretPost
            : ClientAuthentication.None,
        }));
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
    this.fs = options.fsModule ?? fs;
    this.persistentConfigPath = options.persistentConfigPath;
    this.useDefaultPersistentConfigPath = options.persistentConfigPath === undefined;
    this.selectConfigFile = options.selectConfigFile ?? defaultSelectConfigFile;
    this.interactiveConfigurationAvailable =
      options.interactiveConfigurationAvailable ??
      (options.selectConfigFile !== undefined ? true : defaultInteractiveConfigurationAvailable());
  }

  resolvePersistentConfigPath() {
    if (!this.useDefaultPersistentConfigPath) return this.persistentConfigPath;
    return defaultPersistentConfigPath();
  }

  loadPersistedConfig() {
    if (this.config) return true;
    const persisted = readOAuthConfigFile(this.resolvePersistentConfigPath(), this.fs);
    if (!persisted) return false;
    this.config = persisted;
    return true;
  }

  available() {
    return this.loadPersistedConfig() || this.interactiveConfigurationAvailable;
  }

  async ensureConfigured() {
    if (this.loadPersistedConfig()) return true;
    if (!this.interactiveConfigurationAvailable) {
      throw new GooglePlayError(
        "oauth-not-configured",
        "Cette installation d'AppPublisher ne contient pas sa configuration Google. Réinstallez une version certifiée d'AppPublisher.",
      );
    }

    const selectedPath = await this.selectConfigFile();
    if (selectedPath === undefined) {
      throw new GooglePlayError(
        "oauth-not-configured",
        "La configuration Google d'AppPublisher est indisponible.",
      );
    }
    if (!selectedPath) return false;

    let raw;
    try {
      raw = JSON.parse(this.fs.readFileSync(selectedPath, "utf8"));
    } catch {
      throw new GooglePlayError(
        "oauth-config-invalid",
        "Le fichier choisi n'est pas un fichier JSON Google OAuth valide.",
      );
    }
    const selectedConfig = raw?.installed ? cleanOAuthConfig(raw) : null;
    if (!selectedConfig) {
      throw new GooglePlayError(
        "oauth-config-invalid",
        "Choisissez le fichier JSON d'un client OAuth Google de type Application de bureau.",
      );
    }

    this.config = selectedConfig;
    persistOAuthConfig(this.resolvePersistentConfigPath(), selectedConfig, this.fs);
    return true;
  }

  async authorize(openExternal) {
    if (!(await this.ensureConfigured())) {
      throw new GooglePlayError("cancelled", "La configuration Google a été annulée.");
    }
    if (typeof openExternal !== "function" || typeof this.fetch !== "function") {
      throw new GooglePlayError("oauth-unavailable", "La connexion Google est indisponible.");
    }

    const state = base64Url(crypto.randomBytes(24));
    const codeVerifier = base64Url(crypto.randomBytes(48));
    const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
    let timeout;
    let server;
    try {
      const callback = new Promise((resolve, reject) => {
        server = this.createServer((request, response) => {
          try {
            const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
            if (requestUrl.pathname !== CALLBACK_PATH) {
              response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
              response.end("Not found");
              return;
            }
            const returnedState = requestUrl.searchParams.get("state");
            const code = requestUrl.searchParams.get("code");
            const oauthError = requestUrl.searchParams.get("error");
            const oauthErrorDescription = requestUrl.searchParams.get("error_description");
            if (oauthError || returnedState !== state || !code) {
              response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
              response.end(htmlResponse(false));
              if (oauthError === "access_denied" && !oauthErrorDescription) {
                reject(new GooglePlayError("cancelled", "La connexion Google a été annulée."));
              } else if (oauthError) {
                reject(
                  classifyOAuthError({
                    response: {
                      data: {
                        error: oauthError,
                        error_description: oauthErrorDescription || undefined,
                      },
                    },
                  }),
                );
              } else {
                reject(
                  new GooglePlayError(
                    "oauth-callback-invalid",
                    "La réponse d'authentification Google est invalide.",
                  ),
                );
              }
              return;
            }
            response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            response.end(htmlResponse(true));
            resolve(code);
          } catch (error) {
            reject(error);
          }
        });
        server.on("error", () =>
          reject(
            new GooglePlayError(
              "oauth-listener-failed",
              "Le retour de Google n'a pas pu être reçu.",
            ),
          ),
        );
        server.listen(0, "127.0.0.1");
        timeout = setTimeout(
          () => reject(new GooglePlayError("network-timeout", "La connexion Google a expiré.")),
          this.timeoutMs,
        );
      });

      await new Promise((resolve, reject) => {
        if (server.listening) return resolve();
        server.once("listening", resolve);
        server.once("error", reject);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new GooglePlayError(
          "oauth-listener-failed",
          "Le retour de Google n'a pas pu être reçu.",
        );
      }
      const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
      const client = this.oauthFactory(this.config.clientId, this.config.clientSecret, redirectUri);
      const authUrl = client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["openid", "email", ANDROID_PUBLISHER_SCOPE],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      const opened = await openExternal(authUrl);
      if (opened === false) {
        throw new GooglePlayError(
          "oauth-browser-failed",
          "Le navigateur Google n'a pas pu être ouvert.",
        );
      }
      const code = await callback;
      const tokenResult = await client.getToken({ code, codeVerifier, redirect_uri: redirectUri });
      const tokens = tokenResult?.tokens ?? tokenResult;
      if (!tokens?.refresh_token || !tokens?.access_token) {
        throw new GooglePlayError(
          "oauth-token-missing",
          "Google n'a pas fourni l'autorisation durable nécessaire.",
        );
      }
      const userResponse = await this.fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      const user = userResponse.ok ? await userResponse.json() : null;
      if (!user?.email || user.email_verified === false) {
        throw new GooglePlayError(
          "oauth-account-invalid",
          "Le compte Google n'a pas pu être identifié.",
        );
      }
      return {
        type: "authorized_user",
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret || undefined,
        refresh_token: tokens.refresh_token,
        account_email: user.email,
      };
    } catch (error) {
      throw classifyOAuthError(error);
    } finally {
      if (timeout) clearTimeout(timeout);
      if (server?.listening) server.close();
    }
  }
}

module.exports = {
  CALLBACK_PATH,
  GooglePlayOAuth,
  classifyOAuthError,
  cleanOAuthConfig,
  loadGooglePlayOAuthConfig,
  persistOAuthConfig,
  readOAuthConfigFile,
};
