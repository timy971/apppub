/**
 * Métadonnées de l'application injectées par Vite au build
 * (voir vite.config.ts). Source de vérité : /version.json et app.config.cjs.
 *
 * L'interface ne modifie jamais ces valeurs à la main : elles suivent
 * automatiquement le contenu de version.json.
 */

declare const __APP_VERSION__: string;
declare const __APP_BUILD__: number;
declare const __APP_NAME__: string;
declare const __APP_AUTHOR__: string;
declare const __APP_DESCRIPTION__: string;

export const AppInfo = {
  name: typeof __APP_NAME__ === "string" ? __APP_NAME__ : "AppPublisher",
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  build: typeof __APP_BUILD__ === "number" ? __APP_BUILD__ : 1,
  author: typeof __APP_AUTHOR__ === "string" ? __APP_AUTHOR__ : "Tim C.",
  description:
    typeof __APP_DESCRIPTION__ === "string"
      ? __APP_DESCRIPTION__
      : "Assistant de publication d'applications multiplateformes.",
} as const;
