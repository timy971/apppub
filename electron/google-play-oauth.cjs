const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { OAuth2Client } = require("google-auth-library");
const { GooglePlayError } = require("./google-play-publisher.cjs");

const ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const CALLBACK_PATH = "/oauth2/callback";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function cleanOAuthConfig(value) {
  const source = value?.installed ?? value;
  const rawClientId = source?.client_id ?? source?.clientId;
  const rawClientSecret = source?.client_secret ?? source?.clientSecret;
  const clientId = typeof rawClientId === "string" ? rawClientId.trim() : "";
  const clientSecret = typeof rawClientSecret === "string" ? rawClientSecret.trim() : "";
  if (!clientId.endsWith(".apps.googleusercontent.com")) return null;
  return { clientId, clientSecret };
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
    options.resourcesPath && path.join(options.resourcesPath, "google-play-oauth.json"),
    options.appPath && path.join(options.appPath, "build", "google-play-oauth.json"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const config = cleanOAuthConfig(JSON.parse(fsModule.readFileSync(candidate, "utf8")));
      if (config) return config;
    } catch {
      // Le bouton expliquera comment activer OAuth ; aucun secret n'est journalisé.
    }
  }
  return null;
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

class GooglePlayOAuth {
  constructor(config, options = {}) {
    this.config = cleanOAuthConfig(config);
    this.fetch = options.fetchImpl ?? globalThis.fetch;
    this.createServer = options.createServer ?? http.createServer;
    this.oauthFactory =
      options.oauthFactory ??
      ((clientId, clientSecret, redirectUri) =>
        new OAuth2Client({ clientId, clientSecret: clientSecret || undefined, redirectUri }));
    this.timeoutMs = options.timeoutMs ?? 5 * 60_000;
  }

  available() {
    return !!this.config;
  }

  async authorize(openExternal) {
    if (!this.config) {
      throw new GooglePlayError(
        "oauth-not-configured",
        "La connexion Google n'est pas encore configurée dans cette version d'AppPublisher.",
      );
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
            if (oauthError || returnedState !== state || !code) {
              response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
              response.end(htmlResponse(false));
              reject(
                new GooglePlayError(
                  oauthError === "access_denied" ? "cancelled" : "oauth-callback-invalid",
                  oauthError === "access_denied"
                    ? "La connexion Google a été annulée."
                    : "La réponse d'authentification Google est invalide.",
                ),
              );
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
          () => reject(new GooglePlayError("oauth-timeout", "La connexion Google a expiré.")),
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
      if (!opened) {
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
      if (error instanceof GooglePlayError) throw error;
      throw new GooglePlayError("oauth-failed", "La connexion avec Google a échoué.");
    } finally {
      if (timeout) clearTimeout(timeout);
      if (server?.listening) server.close();
    }
  }
}

module.exports = {
  CALLBACK_PATH,
  GooglePlayOAuth,
  cleanOAuthConfig,
  loadGooglePlayOAuthConfig,
};
