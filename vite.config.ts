/**
 * Vite config partagée avec Electron.
 * `base: './'` est indispensable pour que les assets soient résolus quand
 * l'application est chargée via file:// depuis le binaire packagé.
 */
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    base: "./",
  },
});
