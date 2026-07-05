/**
 * AppPublisher — Métadonnées centralisées.
 *
 * Une seule source de vérité pour :
 *  - le nom affiché de l'application ;
 *  - l'éditeur ;
 *  - la description ;
 *  - l'identifiant bundle (macOS / Windows) ;
 *  - le nom du produit dans les binaires générés.
 *
 * Ce fichier est consommé par :
 *  - electron-builder (via electron-builder.config.cjs) ;
 *  - le script scripts/pack.cjs ;
 *  - potentiellement le main process pour l'écran "À propos".
 *
 * La version, elle, est lue depuis /version.json (source de vérité unique
 * pour l'ensemble du dépôt : app, packaging, UI).
 */
module.exports = {
  productName: "AppPublisher",
  appId: "com.timc.apppublisher",
  author: "Tim C.",
  description: "Assistant de publication d'applications multiplateformes.",
  copyright: `Copyright © ${new Date().getFullYear()} Tim C.`,
  homepage: "https://apppublisher.lovable.app",
};
