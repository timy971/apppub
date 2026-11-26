import { useMemo } from "react";
import { Copy, FileArchive, FolderOpen, History } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HistoryService } from "@/core/history/service";
import { bridge } from "@/core/bridge";
import type { Project, PublishRecord } from "@/core/types";

interface Props {
  project: Project;
  revision: string;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

async function reveal(path: string) {
  try {
    await bridge().shell.revealItem(path);
  } catch {
    toast.error("Impossible de retrouver ce fichier sur cet ordinateur.", {
      description: "Il a peut-être été déplacé ou supprimé. Vérifiez son emplacement ou recréez l'AAB.",
    });
  }
}

async function copy(path: string) {
  try {
    const copied = await bridge().system.copyText(path);
    if (!copied) throw new Error("Clipboard unavailable");
    toast.success("Chemin du fichier copié");
  } catch {
    toast.error("Impossible de copier le chemin du fichier.");
  }
}

function ArtifactRow({ record, latest = false }: { record: PublishRecord; latest?: boolean }) {
  const path = record.artifactPath!;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <FileArchive className="h-4 w-4 shrink-0 text-primary" />
          <span>v{record.version} · build {record.build}</span>
          {latest && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">Dernier AAB</span>}
        </div>
        <div className="mt-1 break-all font-mono text-xs">{fileName(path)}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {new Date(record.createdAt).toLocaleString("fr-FR")} · {record.projectName}
          {record.aabValidation?.verdict === "ready" ? " · Validé pour Google Play" : ""}
        </div>
        <div className="mt-1 break-all text-xs text-muted-foreground" title={path}>{path}</div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void reveal(path)}>
          <FolderOpen className="h-4 w-4" />
          Afficher dans le Finder
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy(path)}>
          <Copy className="h-4 w-4" />
          Copier le chemin
        </Button>
      </div>
    </div>
  );
}

/** Permanent, project-scoped entry point to Android files, even after restarting the app. */
export function BuildArtifactsCard({ project, revision }: Props) {
  const records = useMemo(() => {
    const seen = new Set<string>();
    return HistoryService.forProject(project.id)
      .filter((record) =>
        record.outcome === "success" &&
        typeof record.artifactPath === "string" &&
        record.artifactPath.toLowerCase().endsWith(".aab"),
      )
      .filter((record) => {
        const key = `${record.artifactPath}|${record.build}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  }, [project.id, revision]);

  return (
    <Card className="p-5 shadow-soft" aria-label="Mes fichiers Android">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mes fichiers Android (.aab)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Retrouvez ici vos derniers AAB, même après avoir fermé AppPublisher.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/journal" search={{ view: "history" }}>
            <History className="h-4 w-4" />
            Tout l'historique
          </Link>
        </Button>
      </div>
      {records.length > 0 ? (
        <div className="mt-4 space-y-2">
          {records.map((record, index) => <ArtifactRow key={record.id} record={record} latest={index === 0} />)}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Aucun AAB enregistré pour {project.name}. Après une génération réussie, son fichier apparaîtra ici avec un accès direct au Finder.
          Si votre build a été réalisé avec une ancienne installation d'AppPublisher, consultez également le journal des opérations.
        </p>
      )}
    </Card>
  );
}
