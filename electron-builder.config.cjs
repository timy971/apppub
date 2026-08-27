/**
 * Configuration electron-builder pour AppPublisher.
 *
 * Choix outillage
 *  - electron-builder (et non electron-packager) : produit .dmg/.zip/.exe
 *    en une seule commande, gère l'icône multi-format, et prépare le
 *    terrain pour la signature, la notarisation et l'auto-update sans
 *    changer d'outil.
 *
 * La version est injectée depuis package.json (elle-même synchronisée
 * depuis /version.json par scripts/sync-version.cjs avant chaque build).
 */
const app = require("./app.config.cjs");
const fs = require("fs");
const macDistribution = process.env.APPPUBLISHER_MAC_DISTRIBUTION === "1";
const macPrivateBeta = process.env.APPPUBLISHER_MAC_PRIVATE_BETA === "1";
const windowsDistribution = process.env.APPPUBLISHER_WIN_DISTRIBUTION === "1";
const windowsPrivateBeta = process.env.APPPUBLISHER_WIN_PRIVATE_BETA === "1";
const windowsInstaller = windowsDistribution || windowsPrivateBeta;
const distribution = macDistribution || windowsDistribution;
const azureSigningKeys = [
  "WINDOWS_AZURE_PUBLISHER_NAME",
  "WINDOWS_AZURE_ENDPOINT",
  "WINDOWS_AZURE_CERTIFICATE_PROFILE",
  "WINDOWS_AZURE_SIGNING_ACCOUNT",
];
const azureSigning = azureSigningKeys.every((name) => process.env[name])
  ? {
      publisherName: process.env.WINDOWS_AZURE_PUBLISHER_NAME,
      endpoint: process.env.WINDOWS_AZURE_ENDPOINT,
      certificateProfileName: process.env.WINDOWS_AZURE_CERTIFICATE_PROFILE,
      codeSigningAccountName: process.env.WINDOWS_AZURE_SIGNING_ACCOUNT,
    }
  : undefined;

module.exports = {
  appId: app.appId,
  productName: app.productName,
  copyright: app.copyright,

  directories: {
    output: "dist-app",
    buildResources: "build",
  },

  files: ["dist/**/*", "electron/**/*", "app.config.cjs", "version.json", "package.json"],

  extraResources: fs.existsSync("build/google-play-oauth.json")
    ? [{ from: "build/google-play-oauth.json", to: "google-play-oauth.json" }]
    : [],

  compression: "normal",
  removePackageScripts: true,
  forceCodeSigning: windowsDistribution,
  extraMetadata: {
    name: "apppublisher",
    productName: app.productName,
    author: app.author,
    description: app.description,
    main: "electron/main.cjs",
  },

  // ---------- macOS ----------
  mac: {
    // La bêta privée utilise deux DMG natifs pour éviter de masquer les
    // différences de modules natifs derrière une fusion Universal. La future
    // distribution publique reste configurée en Universal signé/notarisé.
    artifactName: macPrivateBeta ? "${productName}-${arch}.${ext}" : "${productName}.${ext}",
    category: "public.app-category.developer-tools",
    icon: "build/icon.icns",
    target: macDistribution
      ? [
          { target: "dmg", arch: ["universal"] },
          { target: "zip", arch: ["universal"] },
        ]
      : macPrivateBeta
        ? [{ target: "dmg", arch: ["arm64", "x64"] }]
        : [{ target: "dir", arch: ["arm64"] }],
    darkModeSupport: true,
    hardenedRuntime: macDistribution,
    gatekeeperAssess: false,
    identity: macDistribution ? undefined : null,
    notarize: macDistribution,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.inherit.plist",
    extendInfo: {
      CFBundleName: app.productName,
      CFBundleDisplayName: app.productName,
      NSHumanReadableCopyright: app.copyright,
    },
  },
  dmg: {
    title: "${productName} ${version}",
    icon: "build/icon.icns",
    contents: [
      { x: 130, y: 220, type: "file" },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
  },

  publish: distribution
    ? {
        provider: "github",
        owner: app.repository.owner,
        repo: app.repository.name,
        releaseType: "release",
      }
    : null,

  // ---------- Windows ----------
  win: {
    artifactName: "${productName}-Setup.${ext}",
    icon: "build/icon.ico",
    target: windowsInstaller
      ? [{ target: "nsis", arch: ["x64"] }]
      : [{ target: "dir", arch: ["x64"] }],
    azureSignOptions: windowsDistribution ? azureSigning : undefined,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    allowElevation: true,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    shortcutName: app.productName,
    deleteAppDataOnUninstall: false,
  },
};
