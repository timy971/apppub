import { useMemo } from "react";
import {
  ArchiveRestore,
  Package,
  PlusCircle,
  Rocket,
  Save,
  Stethoscope,
  History as HistoryIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import type { Project } from "@/core/types";
import { formatRelative } from "./shared";

interface TimelineEvent {
  id: string;
  kind: "created" | "version" | "build" | "publish" | "backup" | "diagnostic";
  title: string;
  detail?: string;
  at: string;
  outcome?: "success" | "failure";
}

/**
 * Timeline agrégée à partir de sources existantes uniquement
 * (HistoryService + BackupService + createdAt du projet).
 */
export function TimelineCard({ project }: { project: Project }) {
  const events = useMemo(() => buildEvents(project), [project]);

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <HistoryIcon className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Chronologie</h2>
      </div>
      {events.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Aucun événement pour le moment.
        </div>
      ) : (
        <ol className="relative space-y-4 border-l pl-5">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="relative">
              <span
                className={
                  "absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background " +
                  bgFor(e)
                }
              >
                <IconFor kind={e.kind} />
              </span>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{e.title}</div>
                  {e.detail && (
                    <div className="text-xs text-muted-foreground truncate">
                      {e.detail}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatRelative(e.at)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function buildEvents(project: Project): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({
    id: `created-${project.id}`,
    kind: "created",
    title: "Projet ajouté à AppPublisher",
    at: project.createdAt,
  });
  for (const r of HistoryService.forProject(project.id)) {
    const kind = (r.kind ?? "version") as TimelineEvent["kind"];
    events.push({
      id: r.id,
      kind,
      title: titleFor(kind, r.version, r.build, r.outcome),
      detail: r.message,
      at: r.createdAt,
      outcome: r.outcome,
    });
  }
  for (const b of BackupService.list(project.id)) {
    events.push({
      id: b.id,
      kind: "backup",
      title: `Sauvegarde (${labelForReason(b.reason)})`,
      detail: `${b.files.length} fichier(s) mémorisé(s)`,
      at: b.createdAt,
    });
  }
  events.sort((a, b) => (a.at < b.at ? 1 : -1));
  return events;
}

function titleFor(
  kind: TimelineEvent["kind"],
  version: string,
  build: number,
  outcome: "success" | "failure",
): string {
  const prefix =
    kind === "publish"
      ? outcome === "success"
        ? "Publication préparée"
        : "Publication en échec"
      : kind === "build"
        ? outcome === "success"
          ? "Build terminé"
          : "Build en échec"
        : "Version mise à jour";
  return `${prefix} — v${version} · build ${build}`;
}

function labelForReason(reason: string): string {
  switch (reason) {
    case "version":
      return "avant version";
    case "build":
      return "avant build";
    case "publish":
      return "avant publication";
    default:
      return "manuelle";
  }
}

function IconFor({ kind }: { kind: TimelineEvent["kind"] }) {
  const cls = "h-3 w-3 text-white";
  switch (kind) {
    case "created":
      return <PlusCircle className={cls} />;
    case "version":
      return <Save className={cls} />;
    case "build":
      return <Package className={cls} />;
    case "publish":
      return <Rocket className={cls} />;
    case "backup":
      return <ArchiveRestore className={cls} />;
    case "diagnostic":
      return <Stethoscope className={cls} />;
  }
}

function bgFor(e: TimelineEvent): string {
  if (e.outcome === "failure") return "bg-danger";
  switch (e.kind) {
    case "publish":
      return "bg-primary";
    case "build":
      return "bg-success";
    case "version":
      return "bg-info";
    case "backup":
      return "bg-muted-foreground";
    case "created":
      return "bg-primary/70";
    default:
      return "bg-muted-foreground";
  }
}
