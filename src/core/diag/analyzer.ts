/**
 * Phase 3.7 — analyse heuristique du buffer diagnostic.
 * Retourne une liste de constats en français simple. Aucune logique
 * métier n'est modifiée : uniquement de la lecture des traces.
 */
import type { LogEntry } from "./logger";

export interface AnalysisFinding {
  severity: "info" | "warning" | "error";
  title: string;
  detail: string;
}

export function analyze(entries: LogEntry[]): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  if (entries.length === 0) {
    findings.push({
      severity: "info",
      title: "Aucun événement à analyser",
      detail: "Le journal est vide pour cette session.",
    });
    return findings;
  }

  const watchdogs = entries.filter((e) => e.level === "watchdog");
  if (watchdogs.length > 0) {
    findings.push({
      severity: "warning",
      title: `${watchdogs.length} opération(s) bloquée(s) détectée(s)`,
      detail:
        "Le watchdog a repéré des opérations dépassant 2 s. Voir les lignes marquées 'watchdog' pour identifier la cause.",
    });
  }

  const errors = entries.filter(
    (e) => e.level === "error" || e.level === "fatal" || e.level === "op:fail",
  );
  if (errors.length > 0) {
    const last = errors[errors.length - 1];
    findings.push({
      severity: "error",
      title: `${errors.length} erreur(s) enregistrée(s)`,
      detail: `Dernière : « ${last.message } »${last.error ? ` — ${last.error}` : ""}.`,
    });
  }

  // Détecte les IPC lents (durée > 1500ms)
  const slow = entries.filter(
    (e) =>
      e.level === "op:end" &&
      typeof e.durationMs === "number" &&
      e.durationMs > 1500,
  );
  if (slow.length > 0) {
    findings.push({
      severity: "warning",
      title: `${slow.length} opération(s) lente(s) (> 1,5 s)`,
      detail:
        "Certaines opérations prennent longtemps à répondre. Cela peut expliquer un ressenti de lenteur.",
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      title: "Aucune anomalie détectée",
      detail: "Toutes les opérations se sont terminées normalement.",
    });
  }
  return findings;
}
