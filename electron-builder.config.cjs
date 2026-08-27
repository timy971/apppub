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

  // Nettoyage automatique du dossier de sortie avant chaque build.
  directories: {
    output: "dist-app",
    buildResources: "build",
  },

  // Fichiers embarqués dans l'application.
  files: ["dist/**/*", "electron/**/*", "app.config.cjs", "version.json", "package.json"],

  // Le client OAuth desktop n'est pas versionné. Lorsqu'il est présent au
  // packaging, il est embarqué comme ressource de l'application.
  extraResources: fs.existsSync("build/google-play-oauth.json")
    ? [{ from: "build/google-play-oauth.json", to: "google-play-oauth.json" }]
    : [],

  // Compression raisonnable : équilibre taille / temps de packaging.
  compression: "normal",
  removePackageScripts: true,
  // Seule une distribution publique Windows exige la signature. La bêta
  // privée produit le même installateur NSIS sans coût de certificat.
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
    // Nom volontairement stable : la page d'installation peut conserver un
    // seul lien, quelle que soit la version publiée.
    artifactName: "${productName}.${ext}",
    category: "public.app-category.developer-tools",
    icon: "build/icon.icns",
    target: macDistribution
      ? [
          { target: "dmg", arch: ["universal"] },
          { target: "zip", arch: ["universal"] },
        ]
      : [{ target: "dir", arch: ["arm64"] }],
    darkModeSupport: true,
    hardenedRuntime: macDistribution,
    gatekeeperAssess: false,
    // En local, une .app non signée reste disponible pour les tests rapides.
    // En distribution, electron-builder choisit le certificat Developer ID
    // Application du trousseau ou celui fourni par CSC_LINK.
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

  // Les manifests d'auto-update et GitHub Releases ne concernent que la
  // distribution publique. Une bêta privée ne publie rien automatiquement.
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
    // Nom stable pour conserver un lien de téléchargement permanent.
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
