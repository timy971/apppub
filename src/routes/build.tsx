import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Hammer, Check, FolderOpen, ArrowRight, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AppStore, useActiveProject, useSettings } from "@/core/store/app-store";
import type { Workflow, TranslatedError } from "@/core/types";
import { HistoryService } from "@/core/history/service";
import { BuildService } from "@/core/build/service";
import { BackupService } from "@/core/backup/service";
import { bridge } from "@/core/bridge";
import { ErrorCard } from "@/components/error-card";
import { translateError } from "@/core/errors/translator";
import { toast } from "sonner";

export const Route = createFileRoute("/build")({
  component: BuildPage,
});

const STEP_ORDER = [
  { id: "deps", title: "Installation des dépendances" },
  { id: "web", title: "Compilation de l'application web" },
  { id: "sync", title: "Préparation de l'application Android" },
  { id: "gradle", title: "Fabrication du fichier Android" },
  { id: "artifact", title: "Récupération du fichier final" },
];

function BuildPage() {
  const project = useActiveProject();
  const settings = useSettings();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [artifact, setArtifact] = useState<{ path?: string; size?: number } | null>(null);
  const [failure, setFailure] = useState<TranslatedError | null>(null);

  if (!project) {
    return (
      <div>
        <PageHeader title="Construire Android" />
        <Card className="p-8 text-center shadow-soft">
          <div className="text-lg font-semibold">Aucun projet actif</div>
          <Button asChild className="mt-4">
            <Link to="/projects">Aller aux projets</Link>
          </Button>
        </Card>
      </div>
    );
  }

  function updateStep(id: string, status: string, detail?: string) {
    setWorkflow((wf) => {
      const base: Workflow =
        wf ??
        ({
          id: "build",
          title: "Construction de l'application Android",
          currentIndex: 0,
          steps: STEP_ORDER.map((s) => ({ ...s, status: "pending" })),
          startedAt: new Date().toISOString(),
        } as Workflow);
      const steps = base.steps.map((s) =>
        s.id === id ? { ...s, status: status as Workflow["steps"][number]["status"], detail } : s,
      );
      return { ...base, steps, currentIndex: steps.findIndex((s) => s.id === id) };
    });
  }

  async function build() {
    if (!project) return;
    setArtifact(null);
    setFailure(null);
    setWorkflow({
      id: "build",
      title: "Construction de l'application Android",
      currentIndex: 0,
      steps: STEP_ORDER.map((s) => ({ ...s, status: "pending" })),
      startedAt: new Date().toISOString(),
    });

    const start = performance.now();
    try {
      if (settings.autoBackupEnabled) {
        await BackupService.create(project, "build");
      }
      const result = await BuildService.build(project, {
        onStep: updateStep,
      });
      setArtifact({ path: result.aabPath, size: result.aabSize });
      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: project.currentVersion,
        build: project.currentBuild,
        user: settings.userName || "vous",
        durationMs: performance.now() - start,
        outcome: "success",
        message: "Construction Android",
        kind: "build",
        artifactPath: result.aabPath,
        artifactSizeBytes: result.aabSize,
      });
      toast.success("Application construite", {
        description: result.aabPath?.split(/[\\/]/).pop(),
      });
      AppStore.refreshProjects();
    } catch (e) {
      const err = translateError(e);
      setFailure(err);
      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: project.currentVersion,
        build: project.currentBuild,
        user: settings.userName || "vous",
        durationMs: performance.now() - start,
        outcome: "failure",
        message: err.title,
        kind: "build",
      });
    }
  }

  return (
    <div>
      <PageHeader
        title="Construire Android"
        subtitle="AppPublisher fabrique le fichier prêt à être envoyé sur Google Play."
        help={{
          title: "À propos de la construction",
          content:
            "Cette étape produit un fichier .aab, le format demandé par Google Play. Vous n'avez rien à faire de manuel : chaque étape est exécutée pour vous.",
        }}
      />

      <div className="mb-6 rounded-xl border bg-muted/40 p-4 text-sm flex items-center justify-between">
        <span>
          Projet actuel · <strong>{project.name}</strong> · Version{" "}
          <span className="tabular-nums font-semibold">{project.currentVersion}</span> · Build{" "}
          <span className="tabular-nums font-semibold">{project.currentBuild}</span>
        </span>
        {settings.autoBackupEnabled && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Sauvegarde automatique
          </span>
        )}
      </div>

      {!workflow && !failure && (
        <Card className="p-8 text-center shadow-soft">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Hammer className="h-7 w-7" />
          </div>
          <div className="text-lg font-semibold">Prêt à construire</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Cela prend quelques instants. Vous n'avez rien à surveiller.
          </div>
          <Button size="lg" className="mt-6" onClick={build}>
            Lancer la construction
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      )}

      {workflow && !failure && <BuildWorkflowView workflow={workflow} />}

      {artifact && (
        <Card className="mt-6 p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/15 text-success">
              <Check className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold">Application construite avec succès</div>
              <div className="mt-1 text-sm text-muted-foreground font-mono truncate">
                {artifact.path?.split(/[\\/]/).pop()}
              </div>
              {artifact.size && (
                <div className="text-xs text-muted-foreground">
                  Taille : {formatSize(artifact.size)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                if (!artifact.path) return;
                try {
                  await bridge().shell.revealItem(artifact.path);
                } catch {
                  toast.info("Ouverture du dossier disponible dans l'application Desktop.");
                }
              }}
            >
              <FolderOpen className="h-4 w-4" />
              Ouvrir le dossier
            </Button>
          </div>
        </Card>
      )}

      {failure && (
        <div className="mt-6">
          <ErrorCard
            error={failure}
            onRetry={() => {
              setFailure(null);
              setWorkflow(null);
              setArtifact(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function BuildWorkflowView({ workflow }: { workflow: Workflow }) {
  // Import à froid pour éviter dépendance circulaire visuelle : réutilisation du composant.
  const { WorkflowView } = require("@/components/workflow-view") as typeof import("@/components/workflow-view");
  return <WorkflowView workflow={workflow} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}
