/**
 * Point d'entrée SPA utilisé UNIQUEMENT pour le build Electron.
 *
 * Le web (Lovable) continue d'utiliser le pipeline SSR de
 * @lovable.dev/vite-tanstack-config avec src/server.ts + src/start.ts.
 * Ici, on monte le router côté client dans #root, on charge les styles
 * globaux, et on laisse Electron servir le tout en file://.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { routeTree } from "./routeTree.gen";
import "./styles.css";
import { diag, onDiagnosticNavigate } from "./core/diag/logger";
import { installGlobalErrorCapture } from "./core/diag/global-errors";

diag("boot", "main.electron.tsx loaded");
installGlobalErrorCapture();

// DIAGNOSTIC TEMPORAIRE — compteur d'accès à Node.previousSibling
// pour mesurer une boucle de traversée DOM suspectée dans le renderer.
// À retirer une fois le diagnostic terminé.
if (typeof window !== "undefined") {
  const desc = Object.getOwnPropertyDescriptor(Node.prototype, "previousSibling");
  if (desc?.get) {
    let psCount = 0;
    (window as any).__psCount = 0;
    Object.defineProperty(Node.prototype, "previousSibling", {
      configurable: true,
      get() {
        psCount++;
        (window as any).__psCount = psCount;
        if (psCount % 20000 === 0) {
          // eslint-disable-next-line no-console
          console.trace("DIAGNOSTIC previousSibling appelé " + psCount + " fois");
          // eslint-disable-next-line no-alert
          alert("DIAGNOSTIC previousSibling appelé " + psCount + " fois — voir Console pour la pile");
        }
        return desc.get!.call(this);
      },
    });
  }
}


const queryClient = new QueryClient();

// Electron charge l'app via file://…/dist/index.html. Un history "browser"
// tenterait de matcher ce chemin absolu contre les routes et retomberait
// systématiquement sur la 404. Le hash history contourne complètement
// l'URL du fichier : toutes les routes vivent après le "#".
const hashHistory = createHashHistory();

const router = createRouter({
  routeTree,
  history: hashHistory,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});


declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Élément #root introuvable dans index.html");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

// Navigation depuis le menu natif "Diagnostic → Ouvrir la console".
onDiagnosticNavigate?.((target) => {
  try {
    router.navigate({ to: target as never });
  } catch {
    /* noop */
  }
});

