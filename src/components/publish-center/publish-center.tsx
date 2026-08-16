import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppStore, useSettings } from "@/core/store/app-store";
import { DiagnosticService } from "@/core/diagnostic/service";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import { ProjectStatusService } from "@/core/projects/status";
import type { ProjectStatus } from "@/core/projects/status";
import { ReleaseNotesService } from "@/core/release-notes/service";
import { verifyPublishArtifact, type PublishArtifactCheck } from "@/core/publish/artifact";
import type { HealthCheck, Project, PublishRecord } from "@/core/types";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AssistantOrAbove, ExpertOnly } from "@/components/mode-gate";
import { HelpRequestButton } from "@/components/help-request-button";

import { PublishHeader } from "./header";
import { PublishCopilotStrip } from "./copilot-strip";
import { PublishExplainer } from "./publish-explainer";
import { PublishHandoffCard } from "./handoff-card";
import { GooglePlayCard } from "./google-play-card";
import { ReleaseOverviewCard } from "./release-overview";
import { ChecklistCard } from "./checklist";
import { ReleaseNotesCard } from "./release-notes";
import { StoreTargetsCard } from "./store-targets";
import { ValidationSummaryCard } from "./validation-summary";
import { ReleaseHistoryCard } from "./release-history";
import { CopilotService } from "@/core/copilot/service";
import {
  buildChecklist,
  computePreparationScore,
  findLastPreparation,
  findLastPublish,
} from "./shared";

/**
 * Publish Center — centre de préparation d'une release.
 *
 * Architecture :
 *  - Chaque widget est autonome et reçoit uniquement ce dont il a besoin.
 *  - Les données proviennent exclusivement des services existants
 *    (ProjectStatusService, DiagnosticService, HistoryService,
 *     BackupService, ReleaseNotesService). Aucune source dupliquée.
 *  - L'ajout d'une nouvelle plateforme ou d'une intégration store
 *    (Google Play, App Store, TestFlight, GitHub Release) se fait en
 *    ajoutant un widget dans la grille, sans refonte.
 */
export function PublishCenter({ project }: { project: Project }) {
  const settings = useSettings();
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [artifact, setArtifact] = useState<PublishArtifactCheck | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChecks(null);
    setArtifact(null);
    setLoadingError(null);
    void Promise.all([
      DiagnosticService.run(project),
      verifyPublishArtifact(project, HistoryService.list()),
    ])
      .then(([nextChecks, nextArtifact]) => {
        if (cancelled) return;
        setChecks(nextChecks);
        setArtifact(nextArtifact);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadingError(
          error instanceof Error
            ? error.message
            : "AppPublisher n'a pas pu vérifier cette application.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [project, refreshKey]);

  const status: ProjectStatus = useMemo(() => ProjectStatusService.evaluate(project), [project]);
  const history: PublishRecord[] = HistoryService.list();

  const notesFormatted = useMemo(() => ReleaseNotesService.format(notesDraft), [notesDraft]);

  const categories = useMemo(() => {
    if (!artifact) return [];
    return buildChecklist({
      project,
      status,
      checks: checks ?? [],
      history,
      notes: notesFormatted,
      artifact,
    });
  }, [project, status, checks, history, notesFormatted, artifact]);

  const score = useMemo(() => computePreparationScore(categories), [categories]);
  const lastPublish = useMemo(() => findLastPublish(history, project), [history, project]);
  const lastPreparation = useMemo(() => findLastPreparation(history, project), [history, project]);
  const preparedRelease =
    lastPreparation &&
    lastPreparation.version === project.currentVersion &&
    lastPreparation.build === project.currentBuild &&
    artifact?.status === "valid" &&
    lastPreparation.artifactPath === artifact.path
      ? lastPreparation
      : undefined;

  const prepare = useCallback(async () => {
    if (score.level === "blocked") return;
    if (!notesFormatted) {
      const notesCard = document.getElementById("release-notes");
      notesCard?.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(() => document.getElementById("release-notes-input")?.focus(), 250);
      toast.warning("Ajoutez les notes de version", {
        description: "Elles seront envoyées avec le fichier Android sur Google Play.",
      });
      return;
    }
    setPreparing(true);
    const started = performance.now();
    try {
      const verifiedArtifact = await verifyPublishArtifact(project, HistoryService.list());
      setArtifact(verifiedArtifact);
      if (verifiedArtifact.status !== "valid" || !verifiedArtifact.path) {
        toast.error("Le fichier Android n'est pas publiable", {
          description: verifiedArtifact.detail,
        });
        return;
      }
      if (settings.autoBackupEnabled) {
        try {
          await BackupService.create(project, "publish");
        } catch (error) {
          toast.error("Préparation interrompue : sauvegarde impossible", {
            description:
              error instanceof Error ? error.message : "Vérifiez l'accès au dossier du projet.",
            duration: 10_000,
          });
          return;
        }
      }
      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: project.currentVersion,
        build: project.currentBuild,
        user: settings.userName || "vous",
        durationMs: Math.round(performance.now() - started),
        outcome: "success",
        message: "Publication préparée",
        kind: "release-prepared",
        artifactPath: verifiedArtifact.path,
        artifactSizeBytes: verifiedArtifact.size,
        aabValidation: verifiedArtifact.validation,
        aabReportPath: verifiedArtifact.record?.aabReportPath,
        notes: notesFormatted || undefined,
      });
      AppStore.refreshProjects();
      setRefreshKey((n) => n + 1);
      toast.success("Publication préparée", {
        description: "La section Google Play est prête juste en dessous.",
      });
      window.setTimeout(
        () =>
          document
            .getElementById("google-play-publication")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
        150,
      );
    } catch {
      toast.error("La préparation n'a pas pu être enregistrée.");
    } finally {
      setPreparing(false);
    }
  }, [project, score.level, settings.autoBackupEnabled, settings.userName, notesFormatted]);

  if (loadingError) {
    return (
      <Card role="alert" className="border-danger/40 p-6 shadow-soft">
        <h2 className="font-semibold">Vérification impossible</h2>
        <p className="mt-2 text-sm text-muted-foreground">{loadingError}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRefreshKey((n) => n + 1)}>
            Réessayer
          </Button>
          <HelpRequestButton />
        </div>
      </Card>
    );
  }

  if (checks === null || artifact === null) {
    return <PublishCenterSkeleton />;
  }

  const copilotPlan = CopilotService.plan({
    project,
    checks: checks ?? [],
    history,
    backups: BackupService.list(project.id),
  });

  return (
    <div className="space-y-4">
      <PublishExplainer />
      <PublishCopilotStrip
        plan={copilotPlan}
        project={project}
        onPrimaryAction={prepare}
        primaryActionBusy={preparing}
      />
      <PublishHeader
        project={project}
        status={status}
        score={score}
        lastPublish={lastPublish}
        onPrepare={prepare}
        preparing={preparing}
        firstBlocker={(() => {
          const first = categories
            .flatMap((c) => c.entries)
            .find((e) => e.severity === "error")?.action;
          return first;
        })()}
      />

      {preparedRelease && <PublishHandoffCard release={preparedRelease} />}
      <GooglePlayCard
        project={project}
        release={preparedRelease}
        onChanged={() => setRefreshKey((n) => n + 1)}
      />

      <AssistantOrAbove>
        <ReleaseOverviewCard project={project} />
      </AssistantOrAbove>

      <div
        className={
          settings.mode === "discovery"
            ? "grid gap-4"
            : "grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"
        }
      >
        <div className="space-y-4">
          <AssistantOrAbove>
            <ChecklistCard project={project} categories={categories} />
          </AssistantOrAbove>
          <ReleaseNotesCard project={project} draft={notesDraft} onDraftChange={setNotesDraft} />
          <ExpertOnly>
            <StoreTargetsCard project={project} status={status} />
          </ExpertOnly>
        </div>

        <div className="space-y-4">
          <ValidationSummaryCard project={project} score={score} categories={categories} />
          <ExpertOnly>
            <ReleaseHistoryCard project={project} history={history} refreshKey={refreshKey} />
          </ExpertOnly>
        </div>
      </div>
    </div>
  );
}

function PublishCenterSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Vérification de l'application et du fichier Android en cours.</span>
      <Card className="p-6 shadow-soft">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
      </Card>
      <Card className="p-6 shadow-soft">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card className="p-6 shadow-soft space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </Card>
          <Card className="p-6 shadow-soft space-y-3">
            <Skeleton className="h-24 w-full" />
          </Card>
        </div>
        <Card className="p-6 shadow-soft space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </Card>
      </div>
    </div>
  );
}

/** Fallback si aucun projet actif — cohérent avec les autres routes. */
export function NoProjectPublish() {
  return (
    <Card className="p-8 text-center shadow-soft">
      <div className="text-lg font-semibold">Aucun projet actif</div>
      <p className="mt-2 text-sm text-muted-foreground">
        Sélectionnez un projet pour préparer une release.
      </p>
      <Button asChild className="mt-4">
        <Link to="/projects">Aller aux projets</Link>
      </Button>
    </Card>
  );
}
