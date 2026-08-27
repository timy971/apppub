const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const defaultOutputPath = path.join(root, "build", "google-play-oauth.json");
const defaultPublicClientPath = path.join(root, "build", "google-play-oauth-client.json");

function normalizeGoogleOAuthClient(value) {
  const source = value?.installed ?? value;
  const rawClientId = source?.client_id ?? source?.clientId;
  const rawClientSecret = source?.client_secret ?? source?.clientSecret;
  const clientId = typeof rawClientId === "string" ? rawClientId.trim() : "";
  const clientSecret = typeof rawClientSecret === "string" ? rawClientSecret.trim() : "";
  if (!clientId.endsWith(".apps.googleusercontent.com")) return null;
  const installed = { client_id: clientId };
  if (clientSecret) installed.client_secret = clientSecret;
  return { installed };
}

function parseBase64Json(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    return normalizeGoogleOAuthClient(
      JSON.parse(Buffer.from(value.trim(), "base64").toString("utf8")),
    );
  } catch {
    return null;
  }
}

function readExistingConfig(filePath = defaultOutputPath, fsModule = fs) {
  try {
    return normalizeGoogleOAuthClient(JSON.parse(fsModule.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function resolveGoogleOAuthBuildConfig(env = process.env) {
  const direct = normalizeGoogleOAuthClient({
    client_id: env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET,
  });
  if (direct) return { config: direct, source: "client-id" };

  const legacy = parseBase64Json(env.GOOGLE_PLAY_OAUTH_JSON_BASE64);
  if (legacy) return { config: legacy, source: "legacy-base64-json" };

  return null;
}

function writeConfig(filePath, config, fsModule = fs) {
  fsModule.mkdirSync(path.dirname(filePath), { recursive: true });
  fsModule.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function ensureGoogleOAuthBuildConfig(options = {}) {
  const fsModule = options.fsModule ?? fs;
  const env = options.env ?? process.env;
  const outputPath = options.outputPath ?? defaultOutputPath;
  const publicClientPath = options.publicClientPath ?? defaultPublicClientPath;
  const required = options.required === true;

  const existing = readExistingConfig(outputPath, fsModule);
  if (existing) {
    return {
      path: outputPath,
      source: "existing-file",
      hasClientSecret: Boolean(existing.installed.client_secret),
      clientId: existing.installed.client_id,
    };
  }

  const resolved = resolveGoogleOAuthBuildConfig(env);
  if (resolved) {
    writeConfig(outputPath, resolved.config, fsModule);
    return {
      path: outputPath,
      source: resolved.source,
      hasClientSecret: Boolean(resolved.config.installed.client_secret),
      clientId: resolved.config.installed.client_id,
    };
  }

  const publicClient = readExistingConfig(publicClientPath, fsModule);
  if (publicClient) {
    // Le fichier versionné ne doit contenir que l'identifiant public. Même si
    // un secret était ajouté par erreur, on ne le recopie pas dans la build.
    const config = { installed: { client_id: publicClient.installed.client_id } };
    writeConfig(outputPath, config, fsModule);
    return {
      path: outputPath,
      source: "versioned-public-client-id",
      hasClientSecret: false,
      clientId: config.installed.client_id,
    };
  }

  if (!required) return null;
  throw new Error(
    "Client OAuth Google AppPublisher absent. Ajoutez build/google-play-oauth-client.json avec le Client ID public, ou configurez APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID.",
  );
}

if (require.main === module) {
  try {
    const required = process.argv.includes("--required");
    const result = ensureGoogleOAuthBuildConfig({ required });
    if (!result) {
      console.log("• Aucun client OAuth Google intégré pour ce build local.");
    } else {
      console.log(
        `✓ Client OAuth Google prêt (${result.source}${result.hasClientSecret ? ", secret optionnel présent" : ", Client ID uniquement"}).`,
      );
    }
  } catch (error) {
    console.error(`✗ ${error?.message ?? error}`);
    process.exit(1);
  }
}

module.exports = {
  defaultOutputPath,
  defaultPublicClientPath,
  ensureGoogleOAuthBuildConfig,
  normalizeGoogleOAuthClient,
  parseBase64Json,
  readExistingConfig,
  resolveGoogleOAuthBuildConfig,
};
