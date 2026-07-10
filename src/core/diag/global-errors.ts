/**
 * Phase 3.7 — capture globale des erreurs renderer.
 * `installGlobalErrorCapture()` s'installe une seule fois au démarrage.
 */
import { Logger } from "./logger";

let installed = false;

export function installGlobalErrorCapture(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    const err = event.error;
    Logger.error("window", event.message || "error", {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: err instanceof Error ? err.stack : undefined,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    Logger.error("promise", "unhandledrejection", {
      message:
        reason instanceof Error ? reason.message : String(reason ?? "unknown"),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  Logger.installWatchdog();
  Logger.info("diag", "global error capture installé");
}
