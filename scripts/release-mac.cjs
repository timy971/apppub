/**
 * Point d'entrée sûr pour une distribution macOS officielle.
 * Vérifie les prérequis sans afficher la valeur d'aucun secret.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const publish = process.argv.includes("--publish");
const fail = (message) => {
  console.error(`\x1b[31m✗\x1b[0m ${message}`);
  process.exit(1);
};
const ok = (message) => console.log(`\x1b[32m✓\x1b[0m ${message}`);
const present = (name) => typeof process.env[name] === "string" && process.env[name].length > 0;

if (process.platform !== "darwin") {
  fail("La signature et la notarisation Developer ID doivent être lancées sur macOS.");
}

const oauthPath = path.join(root, "build", "google-play-oauth.json");
if (!fs.existsSync(oauthPath)) {
  fail(
    "build/google-play-oauth.json est absent : la connexion Google Play manquerait dans l'application livrée.",
  );
}
try {
  const source = JSON.parse(fs.readFileSync(oauthPath, "utf8"));
  const client = source.installed ?? source;
  if (!client.client_id?.endsWith(".apps.googleusercontent.com") || !client.client_secret) {
    fail(
      "build/google-play-oauth.json n'est pas un client OAuth Google de type Application de bureau.",
    );
  }
} catch {
  fail("build/google-play-oauth.json est illisible ou invalide.");
}
ok("Client OAuth Google Play prêt à être intégré.");

let signingReady = present("CSC_LINK");
if (!signingReady) {
  const identities = spawnSync("/usr/bin/security", ["find-identity", "-v", "-p", "codesigning"], {
    encoding: "utf8",
  });
  signingReady =
    identities.status === 0 && /Developer ID Application:/.test(identities.stdout ?? "");
}
if (!signingReady) {
  fail(
    "Certificat Developer ID Application absent. Installez-le dans le trousseau ou configurez CSC_LINK.",
  );
}
ok("Certificat Developer ID Application disponible.");

const apiKeyReady =
  present("APPLE_API_KEY") &&
  fs.existsSync(process.env.APPLE_API_KEY) &&
  present("APPLE_API_KEY_ID") &&
  present("APPLE_API_ISSUER") &&
  present("APPLE_TEAM_ID");
const appleIdReady =
  present("APPLE_ID") && present("APPLE_APP_SPECIFIC_PASSWORD") && present("APPLE_TEAM_ID");
const keychainReady = present("APPLE_KEYCHAIN_PROFILE");
if (!apiKeyReady && !appleIdReady && !keychainReady) {
  fail(
    "Identifiants de notarisation absents. Configurez la clé API Apple (recommandé), un profil de trousseau ou le trio Apple ID.",
  );
}
ok("Identifiants de notarisation disponibles.");

if (publish && !present("GH_TOKEN") && !present("GITHUB_TOKEN")) {
  fail("GH_TOKEN ou GITHUB_TOKEN est requis pour publier la release GitHub.");
}
if (publish) ok("Autorisation de publication GitHub disponible.");

const result = spawnSync(process.execPath, [path.join(root, "scripts", "pack.cjs"), "mac"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    APPPUBLISHER_MAC_DISTRIBUTION: "1",
    APPPUBLISHER_PUBLISH: publish ? "1" : "0",
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);
