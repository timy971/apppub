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
declare const __BUILD_TIMESTAMP__: string;

export const AppInfo = {
  name: typeof __APP_NAME__ === "string" ? __APP_NAME__ : "AppPublisher",
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  build: typeof __APP_BUILD__ === "number" ? __APP_BUILD__ : 1,
  author: typeof __APP_AUTHOR__ === "string" ? __APP_AUTHOR__ : "Tim C.",
  description:
    typeof __APP_DESCRIPTION__ === "string"
      ? __APP_DESCRIPTION__
      : "Assistant de publication d'applications multiplateformes.",
  buildTimestamp:
    typeof __BUILD_TIMESTAMP__ === "string" ? __BUILD_TIMESTAMP__ : "",
} as const;

/**
 * Retourne le timestamp de build formaté en français,
 * ex. "Build du 24/07 à 14:32". Retourne une chaîne vide
 * si le timestamp n'est pas disponible (build web/dev).
 */
export function formatBuildTimestamp(iso: string = AppInfo.buildTimestamp): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `Build du ${dd}/${mm} à ${hh}:${mi}`;
}
