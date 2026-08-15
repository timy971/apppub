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
const distribution = process.env.APPPUBLISHER_MAC_DISTRIBUTION === "1";

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

  extraMetadata: {
    name: "apppublisher",
    productName: app.productName,
    author: app.author,
    description: app.description,
    main: "electron/main.cjs",
  },

  // ---------- macOS ----------
  mac: {
    category: "public.app-category.developer-tools",
    icon: "build/icon.icns",
    target: distribution
      ? [
          { target: "dmg", arch: ["universal"] },
          { target: "zip", arch: ["universal"] },
        ]
      : [{ target: "dir", arch: ["arm64"] }],
    darkModeSupport: true,
    hardenedRuntime: distribution,
    gatekeeperAssess: false,
    // En local, une .app non signée reste disponible pour les tests rapides.
    // En distribution, electron-builder choisit le certificat Developer ID
    // Application du trousseau ou celui fourni par CSC_LINK.
    identity: distribution ? undefined : null,
    notarize: distribution,
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

  // Le manifeste latest-mac.yml est généré avec les DMG/ZIP. L'application
  // signée l'utilise ensuite pour rechercher les nouvelles versions GitHub.
  publish: distribution
    ? {
        provider: "github",
        owner: app.repository.owner,
        repo: app.repository.name,
        releaseType: "release",
      }
    : null,

  // ---------- Windows (préparation) ----------
  // Génération possible dès qu'electron-builder est lancé sur Windows,
  // ou sur macOS avec Wine installé. Non bloquant pour la Phase 3.6.
  win: {
    icon: "build/icon.ico",
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "zip", arch: ["x64"] },
    ],
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: app.productName,
  },
};
