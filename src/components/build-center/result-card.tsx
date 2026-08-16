import { useMemo } from "react";
import {
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileArchive,
  FileText,
  FolderOpen,
  Minus,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { AabValidationReport, Project } from "@/core/types";
import type { OperationSnapshot } from "@/core/operations/types";
import type { DurationStats } from "@/core/operations/estimator";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { bridge } from "@/core/bridge";
import { toast } from "sonner";
import { formatDuration, formatSize, formatRelativeDelta, shortChecksum } from "./shared";
import { cn } from "@/lib/utils";
import { AndroidCorrectionAssistant } from "./correction-assistant";

interface Artifact {
  aabPath?: string;
  aabSize?: number;
  signatureSha256?: string;
  artifactSha256?: string;
  aabValidation?: AabValidationReport;
  aabReportPath?: string;
}

interface Props {
  project: Project;
  snap: OperationSnapshot;
  elapsedMs: number;
  stats: DurationStats;
  onCorrected: () => void;
}

export function ResultCard({ project, snap, elapsedMs, stats, onCorrected }: Props) {
  const result = snap.result as Artifact | undefined;
  const artifact: Artifact = result ?? {};
  const filename = artifact.aabPath ? artifact.aabPath.split(/[\\/]/).pop() : undefined;

  const checksum = useMemo(() => {
    if (artifact.artifactSha256) return artifact.artifactSha256;
    if (!artifact.aabPath) return undefined;
    return shortChecksum(`${artifact.aabPath}|${artifact.aabSize ?? 0}|${elapsedMs}`);
  }, [artifact.aabPath, artifact.aabSize, artifact.artifactSha256, elapsedMs]);

  const validation = artifact.aabValidation;
  const verdict = validation?.verdict ?? "warnings";
  const banner =
    verdict === "ready"
      ? {
          title: "Prêt pour Google Play",
          className: "bg-success/5",
          iconClassName: "bg-success/15 text-success",
          Icon: CheckCircle2,
        }
      : verdict === "blocked"
        ? {
            title: "AAB bloqué pour Google Play",
            className: "bg-danger/5",
            iconClassName: "bg-danger/15 text-danger",
            Icon: XCircle,
          }
        : {
            title: "AAB construit avec des avertissements",
            className: "bg-warning/5",
            iconClassName: "bg-warning/15 text-warning",
            Icon: AlertTriangle,
          };
  const VerdictIcon = banner.Icon;

  const previous = stats.lastSuccess;
  const delta =
    previous && previous.durationMs > 0
      ? formatRelativeDelta(elapsedMs, previous.durationMs)
      : undefined;
  const sizeDelta =
    previous && artifact.aabSize && previous.artifactSizeBytes
      ? formatRelativeDelta(artifact.aabSize, previous.artifactSizeBytes)
      : undefined;

  async function reveal() {
    if (!artifact.aabPath) return;
    try {
      await bridge().shell.revealItem(artifact.aabPath);
    } catch {
      toast.info("Ouverture du dossier disponible dans l'application Desktop.");
    }
  }
  async function openFolder() {
    if (!artifact.aabPath) return;
    try {
      const parent = artifact.aabPath.replace(/[\\/][^\\/]+$/, "");
      await bridge().shell.openFolder(parent);
    } catch {
      toast.info("Ouverture du dossier disponible dans l'application Desktop.");
    }
  }
  async function copyPath() {
    if (!artifact.aabPath) return;
    try {
      const copied = await bridge().system.copyText(artifact.aabPath);
      toast[copied ? "success" : "error"](
        copied ? "Chemin copié." : "Impossible de copier le chemin.",
      );
    } catch {
      toast.error("Impossible de copier le chemin.");
    }
  }
  async function copyChecksum() {
    if (!checksum) return;
    try {
      const copied = await bridge().system.copyText(checksum);
      toast[copied ? "success" : "error"](
        copied ? "Empreinte copiée." : "Impossible de copier l'empreinte.",
      );
    } catch {
      toast.error("Impossible de copier l'empreinte.");
    }
  }
  async function revealReport() {
    if (!artifact.aabReportPath) return;
    try {
      await bridge().shell.revealItem(artifact.aabReportPath);
    } catch {
      toast.info("Ouverture du rapport disponible dans l'application Desktop.");
    }
  }

  return (
    <Card className="overflow-hidden shadow-soft">
      <div className={cn("border-b p-5 flex items-center gap-4", banner.className)}>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full",
            banner.iconClassName,
          )}
        >
          <VerdictIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{banner.title}</div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground font-mono">
            {filename ?? "Artefact indisponible"}
          </div>
        </div>
      </div>

      {validation && (
        <div className="border-b p-5">
          <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Contrôle de l'AAB
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ValidationMetric label="Package" value={validation.packageName ?? "Illisible"} mono />
            <ValidationMetric
              label="Version réelle"
              value={`${validation.versionName ?? "?"} · code ${validation.versionCode ?? "?"}`}
            />
            <ValidationMetric
              label="SDK"
              value={`min ${validation.minSdk ?? "?"} · cible ${validation.targetSdk ?? "?"}`}
            />
            <ValidationMetric
              label="Bundletool"
              value={
                validation.bundletool.status === "passed"
                  ? `Validé${validation.bundletool.version ? ` · ${validation.bundletool.version}` : ""}`
                  : validation.bundletool.status === "failed"
                    ? "Échec"
                    : "Non disponible"
              }
            />
          </div>
          {validation.issues.length > 0 && (
            <div className="mt-4 space-y-2">
              {validation.issues.map((issue) => (
                <div
                  key={issue.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    issue.severity === "error"
                      ? "border-danger/30 bg-danger/5"
                      : "border-warning/30 bg-warning/5",
                  )}
                >
                  <div className="font-medium">{issue.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{issue.detail}</div>
                </div>
              ))}
            </div>
          )}
          {validation.issues.length > 0 && (
            <div className="mt-4">
              <AndroidCorrectionAssistant
                project={project}
                report={validation}
                onApplied={onCorrected}
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
        <Metric label="Durée" value={formatDuration(elapsedMs)} delta={delta} />
        <Metric label="Taille" value={formatSize(artifact.aabSize)} delta={sizeDelta} />
        <Metric label="Version" value={`v${project.currentVersion}`} />
        <Metric label="Build" value={`#${project.currentBuild}`} />
      </div>

      {artifact.aabPath && (
        <div className="border-t p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Artefact
          </div>
          <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
            <FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm">{artifact.aabPath}</div>
              {checksum && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  SHA-256 du fichier : <span className="font-mono">{checksum}</span>
                </div>
              )}
              {artifact.signatureSha256 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Certificat : <span className="font-mono">{artifact.signatureSha256}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {verdict !== "blocked" && (
              <Button asChild>
                <Link to="/publish">
                  Continuer vers la publication
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
            <Button variant="outline" onClick={reveal}>
              <FolderOpen className="h-4 w-4" />
              Révéler le fichier
            </Button>
            <Button variant="outline" onClick={openFolder}>
              Ouvrir le dossier
            </Button>
            <Button variant="outline" onClick={() => void copyPath()}>
              <Copy className="h-4 w-4" />
              Copier le chemin
            </Button>
            {checksum && (
              <Button variant="ghost" onClick={() => void copyChecksum()}>
                Copier l'empreinte
              </Button>
            )}
            {artifact.aabReportPath && (
              <Button variant="outline" onClick={revealReport}>
                <FileText className="h-4 w-4" />
                Ouvrir le rapport
              </Button>
            )}
          </div>
          {verdict !== "blocked" && (
            <p className="mt-3 text-xs text-muted-foreground">
              Étape suivante : ajoutez les notes de version, préparez la publication, puis envoyez
              le fichier Android aux testeurs internes sur Google Play.
            </p>
          )}
        </div>
      )}

      {previous && (
        <div className="border-t bg-muted/20 p-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Comparaison avec le fichier précédent
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
              a={formatSize(artifact.aabSize)}
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

function ValidationMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 break-all font-medium", mono && "font-mono text-xs")}>{value}</div>
    </div>
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
