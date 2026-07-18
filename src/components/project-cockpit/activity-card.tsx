import { useMemo } from "react";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import type { Project } from "@/core/types";
import { formatRelative } from "./shared";
import { useCockpitNav } from "./cockpit-nav";

/**
 * Résume l'activité récente du projet à partir des services existants.
 * Le refreshKey du cockpit permet de re-lire les services après une
 * action mutante (backup manuel, …) sans nouvelle source de vérité.
 */
export function ActivityCard({ project }: { project: Project }) {
  const { refreshKey } = useCockpitNav();
  const rows = useMemo(() => {
    const history = HistoryService.forProject(project.id);
    const lastVersion = history.find((h) => h.kind === "version");
    const lastBuild = history.find(
      (h) => (h.kind === "build" || h.kind === undefined) && h.outcome === "success",
    );
    const lastPublish = history.find((h) => h.kind === "publish");
    const lastBackup = BackupService.list(project.id)[0];
    return [
      { label: "Dernière modification", at: project.updatedAt },
      { label: "Dernière mise à jour de version", at: lastVersion?.createdAt },
      { label: "Dernier build réussi", at: lastBuild?.createdAt },
      { label: "Dernière préparation de publication", at: lastPublish?.createdAt },
      { label: "Dernière sauvegarde", at: lastBackup?.createdAt },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, refreshKey]);

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Activité récente</h2>
      </div>
      <dl className="space-y-2.5 text-sm">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3"
          >
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="text-right tabular-nums">
              {r.at ? formatRelative(r.at) : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
