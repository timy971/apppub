/**
 * Vite config partagée avec Electron.
 *
 *  - `base: './'` : indispensable pour que les assets soient résolus quand
 *    l'application est chargée via file:// depuis le binaire packagé.
 *  - `define` : injection des métadonnées de l'application (version, nom,
 *    éditeur, description) depuis /version.json et /app.config.cjs, pour
 *    que l'UI puisse les afficher sans dupliquer l'information.
 */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const versionJson = JSON.parse(readFileSync(resolve(here, "version.json"), "utf8")) as {
  version?: string;
  build?: number;
};
const require_ = createRequire(pathToFileURL(resolve(here, "package.json")).href);
const appConfig = require_("./app.config.cjs") as {
  productName?: string;
  author?: string;
  description?: string;
};

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    base: "./",
    define: {
      __APP_VERSION__: JSON.stringify(versionJson.version ?? "0.0.0"),
      __APP_BUILD__: JSON.stringify(Number(versionJson.build ?? 1)),
      __APP_NAME__: JSON.stringify(appConfig.productName ?? "AppPublisher"),
      __APP_AUTHOR__: JSON.stringify(appConfig.author ?? "Tim C."),
      __APP_DESCRIPTION__: JSON.stringify(
        appConfig.description ?? "Assistant de publication d'applications multiplateformes.",
      ),
    },
  },
});
