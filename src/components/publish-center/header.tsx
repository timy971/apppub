import { Rocket, Loader2, Wrench } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import type { Project, PublishRecord } from "@/core/types";
import type { ProjectStatus, CockpitTab } from "@/core/projects/status";
import type { PreparationScore } from "./shared";
import { formatRelative } from "./shared";

interface Props {
  project: Project;
  status: ProjectStatus;
  score: PreparationScore;
  lastPublish?: PublishRecord;
  onPrepare: () => void;
  preparing: boolean;
  /** Première action bloquante à corriger (calculée par le parent). */
  firstBlocker?: { tab: CockpitTab; field?: string };
}


export function PublishHeader({
  project,
  status,
  score,
  lastPublish,
  onPrepare,
  preparing,
  firstBlocker,
}: Props) {
  const navigate = useNavigate();
  const ringColor =
    score.level === "ready"
      ? "text-success"
      : score.level === "almost"
        ? "text-warning"
        : "text-danger";

  const blocked = score.level === "blocked";
  const buttonLabel = blocked ? "Corriger les points bloquants" : "Préparer la release";

  const handleClick = () => {
    if (blocked) {
      // Amène l'utilisateur au premier blocage réel plutôt que d'être un
      // bouton mort. Si aucun blocage n'est identifié, on ouvre le cockpit.
      void navigate({
        to: "/projects/$id",
        params: { id: project.id },
        search: firstBlocker
          ? firstBlocker.field
            ? { tab: firstBlocker.tab, field: firstBlocker.field }
            : { tab: firstBlocker.tab }
          : { tab: "overview" },
      });
      return;
    }
    onPrepare();
  };

  return (
    <Card className="relative overflow-hidden p-6 shadow-soft">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-transparent" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
            {project.logoEmoji ?? "🚀"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {project.name}
              </h1>
              <ProjectStatusBadge status={status} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                Version{" "}
                <span className="font-medium text-foreground">
                  {project.currentVersion}
                </span>
              </span>
              <span>
                Build{" "}
                <span className="font-medium text-foreground">
                  {project.currentBuild}
                </span>
              </span>
              {lastPublish ? (
                <span>Dernière préparation {formatRelative(lastPublish.createdAt)}</span>
              ) : (
                <span>Aucune publication préparée pour ce projet.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <ScoreRing score={score.score} colorClass={ringColor} label={score.label} />
          <Button
            size="lg"
            variant={blocked ? "outline" : "default"}
            onClick={handleClick}
            disabled={preparing}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : blocked ? (
              <Wrench className="h-4 w-4" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>
    </Card>

  );
}

function ScoreRing({
  score,
  colorClass,
  label,
}: {
  score: number;
  colorClass: string;
  label: string;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const dash = (score / 100) * circumference;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth="6"
          />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="currentColor"
            className={colorClass}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
          {score}
        </div>
      </div>
      <div className="hidden sm:block">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Préparation
        </div>
        <div className={"text-sm font-medium " + colorClass}>{label}</div>
      </div>
    </div>
  );
}
