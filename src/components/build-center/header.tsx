import {
  Hammer,
  Loader2,
  CheckCircle2,
  XCircle,
  StopCircle,
  Clock,
  Smartphone,
} from "lucide-react";
import type { Project } from "@/core/types";
import type { OperationSnapshot } from "@/core/operations/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDuration } from "./shared";
import { cn } from "@/lib/utils";

interface Props {
  project: Project;
  snap: OperationSnapshot | null;
  elapsedMs: number;
  onStart: () => void;
  onCancel: () => void;
  onReset: () => void;
  canStart?: boolean;
  canInitializeAndroid?: boolean;
  onInitializeAndroid?: () => void;
}

export function BuildCenterHeader({
  project,
  snap,
  elapsedMs,
  onStart,
  onCancel,
  onReset,
  canStart = true,
  canInitializeAndroid = false,
  onInitializeAndroid,
}: Props) {
  const status = snap?.status ?? "idle";
  const isRunning = status === "running";
  const isFinished = status === "success" || status === "error" || status === "cancelled";

  return (
    <header className="rounded-2xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Hammer className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <span>Création du fichier Android</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              Version {project.currentVersion} · numéro interne {project.currentBuild}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-3">
            <h2 className="truncate text-xl font-semibold">{project.name}</h2>
            <StatusBadge status={status} />
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Clock className="h-4 w-4" />
          {isRunning || isFinished ? formatDuration(elapsedMs) : "—"}
        </div>
        <div className="flex items-center gap-2">
          {!isRunning && !isFinished && canInitializeAndroid && (
            <Button size="lg" onClick={onInitializeAndroid}>
              <Smartphone className="h-4 w-4" />
              Créer le projet Android
            </Button>
          )}
          {!isRunning && !isFinished && !canInitializeAndroid && (
            <Button
              size="lg"
              onClick={onStart}
              disabled={!canStart}
              title={canStart ? undefined : "Le préflight signale un point bloquant."}
            >
              Créer le fichier Android
            </Button>
          )}
          {isRunning && (
            <Button variant="outline" size="lg" onClick={onCancel}>
              <StopCircle className="h-4 w-4" />
              Annuler
            </Button>
          )}
          {isFinished && (
            <Button variant="outline" onClick={onReset}>
              Créer un nouveau fichier
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function StatusBadge({ status }: { status: OperationSnapshot["status"] }) {
  const map: Record<
    OperationSnapshot["status"],
    { label: string; icon: React.ReactNode; className: string }
  > = {
    idle: { label: "Prêt", icon: null, className: "bg-muted text-muted-foreground" },
    running: {
      label: "En cours",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className: "bg-primary/10 text-primary border-primary/30",
    },
    success: {
      label: "Terminé",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className: "bg-success/10 text-success border-success/30",
    },
    error: {
      label: "Erreur",
      icon: <XCircle className="h-3 w-3" />,
      className: "bg-danger/10 text-danger border-danger/30",
    },
    cancelled: {
      label: "Annulé",
      icon: <StopCircle className="h-3 w-3" />,
      className: "bg-warning/10 text-warning border-warning/30",
    },
  };
  const v = map[status];
  return (
    <Badge variant="outline" className={cn("gap-1", v.className)}>
      {v.icon}
      {v.label}
    </Badge>
  );
}
