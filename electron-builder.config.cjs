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
  files: [
    "dist/**/*",
    "electron/**/*",
    "app.config.cjs",
    "version.json",
    "package.json",
  ],

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
    target: [{ target: "dir", arch: ["arm64"] }],
    darkModeSupport: true,
    hardenedRuntime: false, // désactivé tant qu'il n'y a pas de signature Apple
    gatekeeperAssess: false,
    identity: null, // pas de signature Developer ID pour l'instant (Phase future)
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
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
