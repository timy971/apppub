import { Link } from "@tanstack/react-router";
import {
  History as HistoryIcon,
  Package,
  Rocket,
  Save,
  ArchiveRestore,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BackupService } from "@/core/backup/service";
import type { Project, PublishRecord } from "@/core/types";
import { formatRelative } from "./shared";

interface TimelineItem {
  id: string;
  kind: "version" | "build" | "publish" | "backup";
  title: string;
  detail?: string;
  at: string;
  outcome?: "success" | "failure";
}

interface Props {
  project: Project;
  history: PublishRecord[];
  refreshKey?: number;
}

export function ReleaseHistoryCard({ project, history }: Props) {
  const items = buildItems(project, history);

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Historique de release</h2>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link to="/history">
            Voir tout
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Aucune activité de release pour ce projet.
        </div>
      ) : (
        <ol className="relative space-y-4 border-l pl-5">
          {items.slice(0, 6).map((e) => (
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
                  <div className="text-sm font-medium truncate">{e.title}</div>
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

function buildItems(project: Project, history: PublishRecord[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const r of history) {
    if (r.projectId !== project.id) continue;
    const kind = (r.kind ?? "version") as TimelineItem["kind"];
    items.push({
      id: r.id,
      kind,
      title: titleFor(kind, r.version, r.build, r.outcome),
      detail: r.message,
      at: r.createdAt,
      outcome: r.outcome,
    });
  }
  for (const b of BackupService.list(project.id)) {
    items.push({
      id: b.id,
      kind: "backup",
      title: `Sauvegarde (${labelReason(b.reason)})`,
      detail: `${b.files.length} fichier(s) mémorisé(s)`,
      at: b.createdAt,
    });
  }
  items.sort((a, b) => (a.at < b.at ? 1 : -1));
  return items;
}

function titleFor(
  kind: TimelineItem["kind"],
  version: string,
  build: number,
  outcome?: "success" | "failure",
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
        : kind === "backup"
          ? "Sauvegarde"
          : "Version mise à jour";
  return `${prefix} — v${version} · build ${build}`;
}

function labelReason(reason: string): string {
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

function IconFor({ kind }: { kind: TimelineItem["kind"] }) {
  const cls = "h-3 w-3 text-white";
  switch (kind) {
    case "version":
      return <Save className={cls} />;
    case "build":
      return <Package className={cls} />;
    case "publish":
      return <Rocket className={cls} />;
    case "backup":
      return <ArchiveRestore className={cls} />;
  }
}

function bgFor(e: TimelineItem): string {
  if (e.outcome === "failure") return "bg-danger";
  if (e.kind === "publish") return "bg-primary";
  if (e.kind === "build") return "bg-success";
  if (e.kind === "backup") return "bg-muted-foreground";
  return "bg-warning";
}
