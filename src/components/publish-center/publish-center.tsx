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
import type { HealthCheck, Project, PublishRecord } from "@/core/types";

import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { PublishHeader } from "./header";
import { PublishCopilotStrip } from "./copilot-strip";
import { PublishExplainer } from "./publish-explainer";
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
  const [notesDraft, setNotesDraft] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setChecks(null);
    void DiagnosticService.run(project).then((c) => {
      if (!cancelled) setChecks(c);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const status: ProjectStatus = useMemo(
    () => ProjectStatusService.evaluate(project),
    [project, refreshKey],
  );
  const history: PublishRecord[] = useMemo(
    () => HistoryService.list(),
    [project.id, refreshKey],
  );

  const notesFormatted = useMemo(
    () => ReleaseNotesService.format(notesDraft),
    [notesDraft],
  );

  const categories = useMemo(
    () =>
      buildChecklist({
        project,
        status,
        checks: checks ?? [],
        history,
        notes: notesFormatted,
      }),
    [project, status, checks, history, notesFormatted],
  );

  const score = useMemo(() => computePreparationScore(categories), [categories]);
  const lastPublish = useMemo(() => findLastPublish(history, project), [history, project]);

  const prepare = useCallback(async () => {
    if (score.level === "blocked") return;
    setPreparing(true);
    const started = performance.now();
    try {
      if (settings.autoBackupEnabled) {
        try {
          await BackupService.create(project, "publish");
        } catch {
          /* la sauvegarde ne doit jamais bloquer la préparation */
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
        message: "Release préparée",
        kind: "publish",
        notes: notesFormatted || undefined,
      });
      AppStore.refreshProjects();
      setRefreshKey((n) => n + 1);
      toast.success("Release préparée", {
        description: `${project.name} v${project.currentVersion} · build ${project.currentBuild}`,
      });
    } catch {
      toast.error("La préparation n'a pas pu être enregistrée.");
    } finally {
      setPreparing(false);
    }
  }, [
    project,
    score.level,
    settings.autoBackupEnabled,
    settings.userName,
    notesFormatted,
  ]);

  if (checks === null) {
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
      <PublishCopilotStrip plan={copilotPlan} project={project} />
      <PublishHeader
        project={project}
        status={status}
        score={score}
        lastPublish={lastPublish}
        onPrepare={prepare}
        preparing={preparing}
      />

      <ReleaseOverviewCard project={project} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ChecklistCard project={project} categories={categories} />
          <ReleaseNotesCard
            project={project}
            draft={notesDraft}
            onDraftChange={setNotesDraft}
          />
          <StoreTargetsCard project={project} status={status} />
        </div>

        <div className="space-y-4">
          <ValidationSummaryCard project={project} score={score} categories={categories} />
          <ReleaseHistoryCard project={project} history={history} refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}

function PublishCenterSkeleton() {
  return (
    <div className="space-y-4">
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
