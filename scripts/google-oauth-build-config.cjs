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
  if (direct) return { config: direct, source: "environment" };

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

function resultFor(pathValue, source, config) {
  return {
    path: pathValue,
    source,
    hasClientSecret: Boolean(config.installed.client_secret),
    clientId: config.installed.client_id,
  };
}

function ensureGoogleOAuthBuildConfig(options = {}) {
  const fsModule = options.fsModule ?? fs;
  const env = options.env ?? process.env;
  const outputPath = options.outputPath ?? defaultOutputPath;
  const publicClientPath = options.publicClientPath ?? defaultPublicClientPath;
  const required = options.required === true;
  const requireClientSecret = options.requireClientSecret === true;

  // Une valeur injectée au build doit toujours primer sur un ancien fichier
  // généré localement afin qu'une RC ne recycle jamais une configuration
  // OAuth incomplète d'un packaging précédent.
  const resolved = resolveGoogleOAuthBuildConfig(env);
  if (resolved && (!requireClientSecret || resolved.config.installed.client_secret)) {
    writeConfig(outputPath, resolved.config, fsModule);
    return resultFor(outputPath, resolved.source, resolved.config);
  }

  const publicClient = readExistingConfig(publicClientPath, fsModule);
  const injectedSecret =
    typeof env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET === "string"
      ? env.APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET.trim()
      : "";
  if (publicClient && injectedSecret) {
    const config = {
      installed: {
        client_id: publicClient.installed.client_id,
        client_secret: injectedSecret,
      },
    };
    writeConfig(outputPath, config, fsModule);
    return resultFor(outputPath, "versioned-client-id+injected-secret", config);
  }

  const existing = readExistingConfig(outputPath, fsModule);
  if (existing && (!requireClientSecret || existing.installed.client_secret)) {
    return resultFor(outputPath, "existing-file", existing);
  }

  if (publicClient && !requireClientSecret) {
    // Le Client ID peut suffire pour les tests de source/local, mais les builds
    // utilisateurs Google Desktop observées en recette exigent le Client secret
    // lors de l'échange du code au point /token.
    const config = { installed: { client_id: publicClient.installed.client_id } };
    writeConfig(outputPath, config, fsModule);
    return resultFor(outputPath, "versioned-public-client-id", config);
  }

  if (!required) return null;
  if (requireClientSecret) {
    throw new Error(
      "Client secret OAuth Google AppPublisher absent. Pour une build utilisateur, injectez APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET (ou GOOGLE_PLAY_OAUTH_JSON_BASE64) au packaging ; ne commitez jamais le secret dans le dépôt.",
    );
  }
  throw new Error(
    "Client OAuth Google AppPublisher absent. Ajoutez build/google-play-oauth-client.json avec le Client ID public, ou configurez APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID.",
  );
}

if (require.main === module) {
  try {
    const required = process.argv.includes("--required");
    const requireClientSecret = process.argv.includes("--require-client-secret");
    const result = ensureGoogleOAuthBuildConfig({ required, requireClientSecret });
    if (!result) {
      console.log("• Aucun client OAuth Google intégré pour ce build local.");
    } else {
      console.log(
        `✓ Client OAuth Google prêt (${result.source}${result.hasClientSecret ? ", Client ID + secret injecté" : ", Client ID uniquement"}).`,
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
