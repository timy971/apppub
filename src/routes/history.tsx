import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HistoryService } from "@/core/history/service";
import { useActiveProject } from "@/core/store/app-store";
import { bridge } from "@/core/bridge";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const project = useActiveProject();
  const records = useMemo(
    () => (project ? HistoryService.forProject(project.id) : HistoryService.list()),
    [project?.id],
  );

  return (
    <div>
      <PageHeader
        title="Historique"
        subtitle={
          project
            ? `Publications et builds de « ${project.name} ».`
            : "Toutes les publications et builds."
        }
        help={{
          title: "À propos de l'historique",
          content:
            "Chaque opération importante est mémorisée pour vous permettre de retrouver une ancienne version en un clin d'œil.",
        }}
      />

      {records.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">
          Aucune opération enregistrée pour l'instant.
        </Card>
      ) : (
        <div className="grid gap-3">
          {records.map((r) => (
            <Card key={r.id} className="p-4 shadow-soft">
              <div className="flex items-center gap-4">
                <div
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold " +
                    (r.outcome === "success"
                      ? "bg-success/15 text-success"
                      : "bg-danger/15 text-danger")
                  }
                >
                  {r.outcome === "success" ? "✓" : "!"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-medium truncate">{r.projectName}</div>
                    <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {r.kind ?? "action"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    v{r.version} · build {r.build} · par {r.user} ·{" "}
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </div>
                  {r.message && (
                    <div className="mt-1 text-sm text-muted-foreground truncate">{r.message}</div>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <div>{formatDuration(r.durationMs)}</div>
                  {r.artifactSizeBytes && <div>{formatSize(r.artifactSizeBytes)}</div>}
                </div>
                {r.artifactPath && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        await bridge().shell.revealItem(r.artifactPath!);
                      } catch {
                        toast.info("Ouverture disponible dans l'application Desktop.");
                      }
                    }}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Ouvrir
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}
