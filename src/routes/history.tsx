import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HistoryService } from "@/core/history/service";
import { useActiveProject } from "@/core/store/app-store";
import { bridge } from "@/core/bridge";
import { FileText, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import type { PublishRecord } from "@/core/types";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

function HistoryPage() {
  const project = useActiveProject();
  const records = useMemo(
    () => (project ? HistoryService.forProject(project.id) : HistoryService.list()),
    [project],
  );

  return (
    <div>
      <PageHeader
        title="Opérations passées"
        subtitle={
          project
            ? `Fichiers créés et publications de « ${project.name} ».`
            : "Tous les fichiers créés et toutes les publications."
        }
        help={{
          title: "À propos des opérations passées",
          content:
            "Chaque opération importante est mémorisée pour retrouver un fichier ou comprendre ce qui a été publié.",
        }}
      />

      {records.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">
          Aucune opération pour l'instant. Les fichiers créés et les publications apparaîtront ici.
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
                      {r.storeRelease ? "Google Play · test interne" : readableKind(r)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Version {r.version} · nº interne {r.build} · par {r.user} ·{" "}
                    {new Date(r.createdAt).toLocaleString("fr-FR")}
                  </div>
                  {r.message && (
                    <div className="mt-1 text-sm text-muted-foreground truncate">{r.message}</div>
                  )}
                  {r.aabValidation && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 font-medium " +
                          (r.aabValidation.verdict === "ready"
                            ? "bg-success/10 text-success"
                            : r.aabValidation.verdict === "blocked"
                              ? "bg-danger/10 text-danger"
                              : "bg-warning/10 text-warning")
                        }
                      >
                        {r.aabValidation.verdict === "ready"
                          ? "Prêt Google Play"
                          : r.aabValidation.verdict === "blocked"
                            ? "Bloqué"
                            : "Avertissements"}
                      </span>
                      <span className="font-mono">
                        {r.aabValidation.packageName ?? "package inconnu"}
                      </span>
                    </div>
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
                {r.aabReportPath && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      try {
                        await bridge().shell.revealItem(r.aabReportPath!);
                      } catch {
                        toast.info("Ouverture disponible dans l'application Desktop.");
                      }
                    }}
                  >
                    <FileText className="h-4 w-4" />
                    Rapport
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

function readableKind(record: PublishRecord): string {
  const kind = record.kind;
  if (kind === "build") return "Fichier Android";
  if (kind === "release-prepared") return "Publication préparée";
  if (kind === "publish") {
    return !record.storeRelease && record.outcome === "success"
      ? "Publication préparée"
      : "Envoi Google Play";
  }
  if (kind === "version") return "Version";
  if (kind === "backup") return "Sauvegarde";
  return "Action";
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}
