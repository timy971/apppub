/** Point d'entrée sûr pour une distribution Windows officielle. */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const publish = process.argv.includes("--publish");
const fail = (message) => {
  console.error(`\x1b[31m✗\x1b[0m ${message}`);
  process.exit(1);
};
const ok = (message) => console.log(`\x1b[32m✓\x1b[0m ${message}`);
const present = (name) => typeof process.env[name] === "string" && process.env[name].length > 0;

if (process.platform !== "win32") {
  fail("La distribution Windows doit être construite et signée sur Windows.");
}

const oauthPath = path.join(root, "build", "google-play-oauth.json");
if (!fs.existsSync(oauthPath)) {
  fail("build/google-play-oauth.json est absent : la connexion Google Play manquerait.");
}
try {
  const source = JSON.parse(fs.readFileSync(oauthPath, "utf8"));
  const client = source.installed ?? source;
  if (!client.client_id?.endsWith(".apps.googleusercontent.com") || !client.client_secret) {
    fail("build/google-play-oauth.json n'est pas un client OAuth Google de bureau.");
  }
} catch {
  fail("build/google-play-oauth.json est illisible ou invalide.");
}
ok("Client OAuth Google Play prêt à être intégré.");

const pfxReady = present("CSC_LINK") && present("CSC_KEY_PASSWORD");
const azureReady = [
  "WINDOWS_AZURE_PUBLISHER_NAME",
  "WINDOWS_AZURE_ENDPOINT",
  "WINDOWS_AZURE_CERTIFICATE_PROFILE",
  "WINDOWS_AZURE_SIGNING_ACCOUNT",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
].every(present);
if (!pfxReady && !azureReady) {
  fail("Signature Windows absente. Configurez un certificat PFX ou Microsoft Trusted Signing.");
}
ok(
  `Signature Windows disponible (${azureReady ? "Microsoft Trusted Signing" : "certificat PFX"}).`,
);

if (publish && !present("GH_TOKEN") && !present("GITHUB_TOKEN")) {
  fail("GH_TOKEN ou GITHUB_TOKEN est requis pour publier la release GitHub.");
}

const run = (script, args = [], env = process.env) => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", script), ...args], {
    cwd: root,
    stdio: "inherit",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("pack.cjs", ["win"], { ...process.env, APPPUBLISHER_WIN_DISTRIBUTION: "1" });
run("verify-win-release.cjs");
if (publish) run("publish-win-release.cjs");
