import { Link } from "@tanstack/react-router";
import { Star, ArrowRight, Hammer, Rocket, FolderPlus } from "lucide-react";
import type { Project, PublishRecord } from "@/core/types";
import type { ProjectStatus } from "@/core/projects/status";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { ProjectLifecycleBadge } from "@/components/project-lifecycle-badge";
import { formatRelative } from "@/components/project-cockpit/shared";
import { cn } from "@/lib/utils";

export interface ProjectSummary {
  project: Project;
  status: ProjectStatus;
  lastBuild?: PublishRecord;
  lastPublish?: PublishRecord;
}

export function ProjectsGrid({
  summaries,
  activeId,
  loading,
}: {
  summaries: ProjectSummary[];
  activeId: string | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <Card className="p-8 text-center shadow-soft">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <FolderPlus className="h-6 w-6" />
        </div>
        <div className="text-base font-semibold">Aucun projet pour l'instant</div>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Ajoutez votre premier projet pour qu'AppPublisher commence à vous accompagner.
        </p>
        <Button asChild className="mt-4">
          <Link to="/projects">Ajouter un projet</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {summaries.map((s) => (
        <ProjectCard key={s.project.id} summary={s} isActive={s.project.id === activeId} />
      ))}
    </div>
  );
}

function ProjectCard({
  summary,
  isActive,
}: {
  summary: ProjectSummary;
  isActive: boolean;
}) {
  const { project, status, lastBuild, lastPublish } = summary;
  return (
    <Link
      to="/projects/$id"
      params={{ id: project.id }}
      className={cn(
        "group block rounded-xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated",
        isActive && "ring-2 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl">
          {project.logoEmoji ?? "📱"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {project.favorite && (
              <Star className="h-3.5 w-3.5 fill-warning text-warning shrink-0" />
            )}
            <span className="truncate font-semibold">{project.name}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            v{project.currentVersion} · build {project.currentBuild}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <ProjectStatusBadge status={status} />
        <ProjectLifecycleBadge lifecycle={project.lifecycle} />
        {isActive && (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-primary/20">
            Actif
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t pt-3 text-xs">
        <MiniStat
          icon={Hammer}
          label="Build"
          value={lastBuild ? formatRelative(lastBuild.createdAt) : "—"}
        />
        <MiniStat
          icon={Rocket}
          label="Publication"
          value={lastPublish ? formatRelative(lastPublish.createdAt) : "—"}
        />
      </div>
    </Link>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className="mt-0.5 truncate font-medium text-foreground">{value}</div>
    </div>
  );
}
