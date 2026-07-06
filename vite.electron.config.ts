/**
 * Config Vite dédiée au build Electron (SPA statique).
 *
 * Elle N'UTILISE PAS @lovable.dev/vite-tanstack-config afin de sortir du
 * pipeline SSR/Nitro : on veut un simple `dist/index.html` + `dist/assets/*`
 * chargeable en `file://` par Electron. La config web (SSR Lovable) reste
 * inchangée dans vite.config.ts.
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import tsconfigPaths from "vite-tsconfig-paths";
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
  base: "./", // indispensable pour file://
  plugins: [
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(versionJson.version ?? "0.0.0"),
    __APP_BUILD__: JSON.stringify(Number(versionJson.build ?? 1)),
    __APP_NAME__: JSON.stringify(appConfig.productName ?? "AppPublisher"),
    __APP_AUTHOR__: JSON.stringify(appConfig.author ?? "Tim C."),
    __APP_DESCRIPTION__: JSON.stringify(
      appConfig.description ?? "Assistant de publication d'applications multiplateformes.",
    ),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
