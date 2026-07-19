import { Link } from "@tanstack/react-router";
import { Clock, CheckCircle2, XCircle, StopCircle, History } from "lucide-react";
import type { Project, PublishRecord, Settings } from "@/core/types";
import type { OperationSnapshot } from "@/core/operations/types";
import type { DurationStats } from "@/core/operations/estimator";
import { HistoryService } from "@/core/history/service";
import { Card } from "@/components/ui/card";
import { formatDuration, formatSize } from "./shared";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface Props {
  project: Project;
  settings: Settings;
  snap: OperationSnapshot | null;
  stats: DurationStats;
}

export function SidePanel({ project, settings, snap, stats }: Props) {
  const recent = useMemo(
    () =>
      HistoryService.forProject(project.id)
        .filter((r) => r.kind === "build")
        .slice(0, 5),
    [project.id, snap?.status],
  );

  return (
    <div className="space-y-4">
      <Card className="p-5 shadow-soft">
        <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Résumé
        </div>
        <dl className="space-y-2 text-sm">
          <Row label="Projet" value={project.name} />
          <Row
            label="Version"
            value={
              <span className="tabular-nums">
                v{project.currentVersion} · build {project.currentBuild}
              </span>
            }
          />
          <Row label="Type" value="Bundle Android (.aab)" />
          <Row label="Utilisateur" value={settings.userName || "vous"} />
          {stats.sampleSize > 0 && (
            <Row
              label="Durée moyenne"
              value={
                <span className="tabular-nums">
                  {formatDuration(stats.averageMs)}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({stats.sampleSize} builds)
                  </span>
                </span>
              }
            />
          )}
          {stats.lastMs != null && (
            <Row
              label="Dernier build"
              value={<span className="tabular-nums">{formatDuration(stats.lastMs)}</span>}
            />
          )}
        </dl>
      </Card>

      <Card className="p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Historique rapide
          </div>
          <Link
            to="/history"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <History className="h-3 w-3" />
            Tout voir
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Aucun build enregistré pour ce projet.
          </div>
        ) : (
          <ul className="space-y-2">
            {recent.map((rec) => (
              <li key={rec.id}>
                <HistoryRow rec={rec} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function HistoryRow({ rec }: { rec: PublishRecord }) {
  const OutcomeIcon =
    rec.outcome === "success" ? CheckCircle2 : XCircle;
  const tone =
    rec.outcome === "success" ? "text-success" : "text-danger";
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <OutcomeIcon className={cn("h-4 w-4 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">
          v{rec.version} · build {rec.build}
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(rec.createdAt).toLocaleString("fr-FR", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatDuration(rec.durationMs)}
      </div>
    </div>
  );
}

// Marqueur utilisé pour l'annulation dans un futur badge.
export const CANCELLED_ICON = StopCircle;
