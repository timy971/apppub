const fs = require("node:fs");
const path = require("node:path");

const requiredGoogle = ["GOOGLE_PLAY_OAUTH_JSON_BASE64"];
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

const missingGoogle = missing(requiredGoogle);
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

const failures = [...missingGoogle, ...missingSigning];
if (failures.length > 0) {
  console.error("\n✗ AppPublisher ne peut pas produire un installateur Windows signé.");
  console.error("  Configuration manquante :");
  for (const name of failures) console.error(`  - ${name}`);
  console.error("\n  Aucun secret n'a été affiché, uniquement les noms des variables absentes.\n");
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
console.log("✓ Client OAuth Google Play présent.");
console.log("✓ Les paramètres de signature requis sont présents.");
