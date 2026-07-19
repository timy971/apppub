import { Link } from "@tanstack/react-router";
import {
  Hammer,
  Rocket,
  GitBranch,
  Archive,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import type { Project, ProjectBackup, PublishRecord } from "@/core/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/components/project-cockpit/shared";
import { cn } from "@/lib/utils";

export type ActivityEventKind = "version" | "build" | "publish" | "backup";

export interface ActivityEvent {
  id: string;
  kind: ActivityEventKind;
  projectId: string;
  projectName: string;
  createdAt: string;
  title: string;
  detail?: string;
  success: boolean;
}

const ICONS: Record<ActivityEventKind, React.ComponentType<{ className?: string }>> = {
  version: GitBranch,
  build: Hammer,
  publish: Rocket,
  backup: Archive,
};

const KIND_CLASS: Record<ActivityEventKind, string> = {
  version: "bg-primary/10 text-primary",
  build: "bg-warning/10 text-warning",
  publish: "bg-success/10 text-success",
  backup: "bg-muted text-muted-foreground",
};

export function buildActivityEvents(
  history: PublishRecord[],
  backups: { backup: ProjectBackup; project: Project }[],
): ActivityEvent[] {
  const fromHistory: ActivityEvent[] = history.map((h) => {
    const kind: ActivityEventKind = (h.kind ?? "publish") as ActivityEventKind;
    return {
      id: `h_${h.id}`,
      kind,
      projectId: h.projectId,
      projectName: h.projectName,
      createdAt: h.createdAt,
      title:
        kind === "version"
          ? `Version ${h.version}`
          : kind === "build"
            ? `Build v${h.version} (${h.build})`
            : `Publication v${h.version}`,
      detail: h.message,
      success: h.outcome === "success",
    };
  });
  const fromBackups: ActivityEvent[] = backups.map(({ backup, project }) => ({
    id: `b_${backup.id}`,
    kind: "backup",
    projectId: project.id,
    projectName: project.name,
    createdAt: backup.createdAt,
    title: reasonLabel(backup.reason),
    detail: `${backup.files.length} fichier(s) sauvegardé(s)`,
    success: true,
  }));
  return [...fromHistory, ...fromBackups].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function reasonLabel(r: ProjectBackup["reason"]): string {
  switch (r) {
    case "manual":
      return "Sauvegarde manuelle";
    case "version":
      return "Sauvegarde avant version";
    case "build":
      return "Sauvegarde avant build";
    case "publish":
      return "Sauvegarde avant publication";
  }
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (start(today) - start(d)) / 86400000;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  if (diff < 7) return `Il y a ${Math.round(diff)} jours`;
  if (diff < 30) return `Il y a ${Math.round(diff / 7)} semaines`;
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

export function ActivityTimeline({
  events,
  loading,
  limit = 12,
}: {
  events: ActivityEvent[];
  loading: boolean;
  limit?: number;
}) {
  if (loading) {
    return (
      <Card className="p-6 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">Activité récente</h3>
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const items = events.slice(0, limit);

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">Activité récente</h3>
        <Link
          to="/history"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Tout l'historique →
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucune activité pour l'instant. Vos versions, builds et publications
          apparaîtront ici.
        </p>
      ) : (
        <ol className="space-y-4">
          {groupByLabel(items).map((group) => (
            <li key={group.label}>
              <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                {group.label}
              </div>
              <ul className="space-y-2">
                {group.items.map((e) => {
                  const Icon = ICONS[e.kind];
                  return (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/50"
                    >
                      <div
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          KIND_CLASS[e.kind],
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium truncate">{e.title}</span>
                          {e.success ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-danger" />
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground truncate">
                          {e.projectName} · {formatRelative(e.createdAt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function groupByLabel(items: ActivityEvent[]): { label: string; items: ActivityEvent[] }[] {
  const map = new Map<string, ActivityEvent[]>();
  for (const it of items) {
    const key = groupLabel(it.createdAt);
    const arr = map.get(key) ?? [];
    arr.push(it);
    map.set(key, arr);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}
