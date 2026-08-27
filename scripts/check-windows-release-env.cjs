const fs = require("node:fs");
const path = require("node:path");
const { resolveGoogleOAuthBuildConfig } = require("./google-oauth-build-config.cjs");

const azureNames = [
  "WINDOWS_AZURE_PUBLISHER_NAME",
  "WINDOWS_AZURE_ENDPOINT",
  "WINDOWS_AZURE_CERTIFICATE_PROFILE",
  "WINDOWS_AZURE_SIGNING_ACCOUNT",
  "AZURE_TENANT_ID",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
];
const pfxNames = ["WINDOWS_CERTIFICATE_PFX_BASE64", "WINDOWS_CERTIFICATE_PASSWORD"];

function present(name) {
  return typeof process.env[name] === "string" && process.env[name].trim().length > 0;
}

function missing(names) {
  return names.filter((name) => !present(name));
}

const googleReady = Boolean(resolveGoogleOAuthBuildConfig(process.env));
const hasAnyAzure = azureNames.some(present);
const hasAnyPfx = pfxNames.some(present);

let mode = null;
let missingSigning = [];

if (hasAnyAzure) {
  mode = "azure-artifact-signing";
  missingSigning = missing(azureNames);
} else if (hasAnyPfx) {
  mode = "pfx";
  missingSigning = missing(pfxNames);
} else {
  missingSigning = [
    "WINDOWS_AZURE_ENDPOINT (mode Azure Artifact Signing recommandé)",
    "ou WINDOWS_CERTIFICATE_PFX_BASE64 (mode certificat PFX)",
  ];
}

const failures = [
  ...(!googleReady
    ? ["APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID (ou GOOGLE_PLAY_OAUTH_JSON_BASE64 pour compatibilité)"]
    : []),
  ...missingSigning,
];
if (failures.length > 0) {
  console.error("\n✗ AppPublisher ne peut pas produire un installateur Windows signé.");
  console.error("  Configuration manquante :");
  for (const name of failures) console.error(`  - ${name}`);
  console.error("\n  Aucune valeur sensible n'a été affichée, uniquement les noms des paramètres absents.\n");
  process.exit(1);
}

if (mode === "pfx") {
  const target = path.join(process.env.RUNNER_TEMP || process.cwd(), "AppPublisher-signing.pfx");
  try {
    const bytes = Buffer.from(process.env.WINDOWS_CERTIFICATE_PFX_BASE64, "base64");
    if (bytes.length < 32) throw new Error("contenu trop court");
    fs.writeFileSync(target, bytes, { mode: 0o600 });
  } catch {
    console.error("✗ WINDOWS_CERTIFICATE_PFX_BASE64 n'est pas un certificat PFX encodé en base64 valide.");
    process.exit(1);
  }
}

console.log(`✓ Préflight Windows : mode ${mode}.`);
console.log("✓ Identité OAuth Google Play AppPublisher présente.");
console.log("✓ Les paramètres de signature requis sont présents.");
