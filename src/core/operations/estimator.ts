import { HistoryService } from "@/core/history/service";
import type { PublishKind, PublishRecord, UUID } from "@/core/types";

/**
 * OperationEstimator — statistiques temporelles issues de l'historique.
 * Aucune donnée simulée : tout provient de HistoryService.
 */

export interface DurationStats {
  averageMs?: number;
  lastMs?: number;
  lastSuccess?: PublishRecord;
  sampleSize: number;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export const OperationEstimator = {
  stats(projectId: UUID, kind: PublishKind): DurationStats {
    const items = HistoryService.forProject(projectId).filter(
      (r) => r.kind === kind && r.outcome === "success" && r.durationMs > 0,
    );
    if (!items.length) return { sampleSize: 0 };
    // items est déjà en ordre anti-chronologique (record() unshift).
    const sample = items.slice(0, 10);
    return {
      averageMs: mean(sample.map((r) => r.durationMs)),
      lastMs: items[0].durationMs,
      lastSuccess: items[0],
      sampleSize: items.length,
    };
  },

  /**
   * Estimation du temps restant en fonction du ratio d'avancement.
   * `progress` ∈ [0..1]. Retourne 0 si aucune référence n'est disponible.
   */
  remainingMs(elapsedMs: number, progress: number, avgMs?: number): number {
    if (progress >= 1) return 0;
    // Si l'on a une moyenne historique, on l'utilise en priorité.
    if (avgMs && avgMs > 0) {
      return Math.max(0, avgMs - elapsedMs);
    }
    if (progress <= 0.01) return 0;
    const total = elapsedMs / progress;
    return Math.max(0, total - elapsedMs);
  },
};
