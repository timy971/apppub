import { useMemo } from "react";
import { CheckCircle2, FolderOpen, Copy, FileArchive, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Project } from "@/core/types";
import type { OperationSnapshot } from "@/core/operations/types";
import type { DurationStats } from "@/core/operations/estimator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { bridge } from "@/core/bridge";
import { toast } from "sonner";
import { formatDuration, formatSize, formatRelativeDelta, shortChecksum } from "./shared";
import { cn } from "@/lib/utils";

interface Artifact {
  path?: string;
  size?: number;
}

interface Props {
  project: Project;
  snap: OperationSnapshot;
  elapsedMs: number;
  stats: DurationStats;
}

export function ResultCard({ project, snap, elapsedMs, stats }: Props) {
  const result = snap.result as Artifact | undefined;
  const artifact: Artifact = result ?? {};
  const filename = artifact.path ? artifact.path.split(/[\\/]/).pop() : undefined;

  const checksum = useMemo(() => {
    if (!artifact.path) return undefined;
    return shortChecksum(`${artifact.path}|${artifact.size ?? 0}|${elapsedMs}`);
  }, [artifact.path, artifact.size, elapsedMs]);

  const previous = stats.lastSuccess;
  const delta =
    previous && previous.durationMs > 0
      ? formatRelativeDelta(elapsedMs, previous.durationMs)
      : undefined;
  const sizeDelta =
    previous && artifact.size && previous.artifactSizeBytes
      ? formatRelativeDelta(artifact.size, previous.artifactSizeBytes)
      : undefined;

  async function reveal() {
    if (!artifact.path) return;
    try {
      await bridge().shell.revealItem(artifact.path);
    } catch {
      toast.info("Ouverture du dossier disponible dans l'application Desktop.");
    }
  }
  async function openFolder() {
    if (!artifact.path) return;
    try {
      const parent = artifact.path.replace(/[\\/][^\\/]+$/, "");
      await bridge().shell.openFolder(parent);
    } catch {
      toast.info("Ouverture du dossier disponible dans l'application Desktop.");
    }
  }
  function copyPath() {
    if (!artifact.path) return;
    void navigator.clipboard.writeText(artifact.path).then(
      () => toast.success("Chemin copié."),
      () => toast.error("Impossible de copier le chemin."),
    );
  }
  function copyChecksum() {
    if (!checksum) return;
    void navigator.clipboard.writeText(checksum).then(
      () => toast.success("Empreinte copiée."),
    );
  }

  return (
    <Card className="overflow-hidden shadow-soft">
      <div className="border-b bg-success/5 p-5 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">Build terminé avec succès</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground font-mono">
            {filename ?? "Artefact indisponible"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
        <Metric label="Durée" value={formatDuration(elapsedMs)} delta={delta} />
        <Metric label="Taille" value={formatSize(artifact.size)} delta={sizeDelta} />
        <Metric label="Version" value={`v${project.currentVersion}`} />
        <Metric label="Build" value={`#${project.currentBuild}`} />
      </div>

      {artifact.path && (
        <div className="border-t p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Artefact
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm">{artifact.path}</div>
              {checksum && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Empreinte : <span className="font-mono">{checksum}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={reveal}>
              <FolderOpen className="h-4 w-4" />
              Révéler le fichier
            </Button>
            <Button variant="outline" onClick={openFolder}>
              Ouvrir le dossier
            </Button>
            <Button variant="outline" onClick={copyPath}>
              <Copy className="h-4 w-4" />
              Copier le chemin
            </Button>
            {checksum && (
              <Button variant="ghost" onClick={copyChecksum}>
                Copier l'empreinte
              </Button>
            )}
          </div>
        </div>
      )}

      {previous && (
        <div className="border-t bg-muted/20 p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Comparaison avec le build précédent
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <Compare label="Version" a={`v${project.currentVersion}`} b={`v${previous.version}`} />
            <Compare label="Build" a={`#${project.currentBuild}`} b={`#${previous.build}`} />
            <Compare
              label="Durée"
              a={formatDuration(elapsedMs)}
              b={formatDuration(previous.durationMs)}
            />
            <Compare
              label="Taille"
              a={formatSize(artifact.size)}
              b={formatSize(previous.artifactSizeBytes)}
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Référence :{" "}
            {new Date(previous.createdAt).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { label: string; tone: "faster" | "slower" | "equal" };
}) {
  const Icon =
    delta?.tone === "faster" ? TrendingDown : delta?.tone === "slower" ? TrendingUp : Minus;
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {delta && (
        <div
          className={cn(
            "mt-0.5 inline-flex items-center gap-1 text-xs",
            delta.tone === "faster" && "text-success",
            delta.tone === "slower" && "text-warning",
            delta.tone === "equal" && "text-muted-foreground",
          )}
        >
          <Icon className="h-3 w-3" />
          {delta.label}
        </div>
      )}
    </div>
  );
}

function Compare({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2 text-sm">
        <span className="font-medium tabular-nums">{a}</span>
        <span className="text-xs text-muted-foreground">/ {b}</span>
      </div>
    </div>
  );
}
