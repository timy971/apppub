import { useMemo } from "react";
import type { OperationSnapshot } from "@/core/operations/types";
import type { DurationStats } from "@/core/operations/estimator";
import { OperationEstimator } from "@/core/operations/estimator";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDuration } from "./shared";
import { cn } from "@/lib/utils";

interface Props {
  snap: OperationSnapshot;
  elapsedMs: number;
  stats: DurationStats;
}

export function ProgressPanel({ snap, elapsedMs, stats }: Props) {
  const total = snap.steps.length || 1;
  const done = snap.steps.filter(
    (s) => s.status === "success" || s.status === "warning" || s.status === "skipped",
  ).length;
  const currentIdx = snap.steps.findIndex((s) => s.status === "running");
  const current = currentIdx >= 0 ? snap.steps[currentIdx] : undefined;

  // Progression : étapes terminées + demi-étape en cours pour un rendu vivant.
  const progress = useMemo(() => {
    const base = done / total;
    const inFlight = current ? 0.5 / total : 0;
    return Math.min(1, base + inFlight);
  }, [done, total, current]);

  const remaining =
    snap.status === "running"
      ? OperationEstimator.remainingMs(elapsedMs, progress, stats.averageMs)
      : 0;

  const percent = Math.round(progress * 100);
  const stepNumber = current ? currentIdx + 1 : snap.status === "success" ? total : done;

  return (
    <Card className="p-6 shadow-soft">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Progression
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="text-5xl font-semibold tabular-nums">{percent}%</div>
            <div className="text-sm text-muted-foreground tabular-nums">
              Étape {stepNumber} / {total}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {snap.status === "running" ? "Temps écoulé" : "Durée totale"}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {formatDuration(elapsedMs)}
          </div>
          {snap.status === "running" && remaining > 0 && (
            <div className="text-xs text-muted-foreground tabular-nums">
              Reste ~ {formatDuration(remaining)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5">
        <Progress value={percent} className="h-2" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className={cn("min-w-0 truncate", current ? "text-foreground" : "text-muted-foreground")}>
          {current
            ? <><span className="font-medium">{current.title}</span>{current.detail ? ` · ${current.detail}` : ""}</>
            : snap.status === "success"
              ? "Build terminé avec succès."
              : snap.status === "error"
                ? "Le build a été interrompu par une erreur."
                : snap.status === "cancelled"
                  ? "Build annulé."
                  : "En attente du démarrage."}
        </div>
        {stats.averageMs ? (
          <div className="text-xs text-muted-foreground tabular-nums">
            Moyenne des {stats.sampleSize} derniers builds : {formatDuration(stats.averageMs)}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
