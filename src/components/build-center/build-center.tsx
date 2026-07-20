import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/core/types";
import { AppStore, useSettings } from "@/core/store/app-store";
import { OperationRunner } from "@/core/operations/runner";
import type { OperationSnapshot } from "@/core/operations/types";
import { useOperationSnapshot } from "@/core/operations/use-operation";
import { OperationEstimator } from "@/core/operations/estimator";
import { createAndroidBuildOperation } from "@/core/operations/android-build";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import { translateError } from "@/core/errors/translator";
import { toast } from "sonner";

import { BuildCenterHeader } from "./header";
import { ProgressPanel } from "./progress-panel";
import { StepsTimeline } from "./steps-timeline";
import { SidePanel } from "./side-panel";
import { LogConsole } from "./log-console";
import { ResultCard } from "./result-card";
import { BuildErrorPanel } from "./error-panel";
import { LiveStatus } from "./live-status";
import { BuildTips } from "./build-tips";

interface Props {
  project: Project;
}

/**
 * Build Center — écran principal d'exécution d'un build Android.
 *
 * Architecture :
 *  - Un OperationRunner générique porte l'état (steps, logs, statut).
 *  - Ce composant orchestre : lancement, annulation, enregistrement
 *    historique, notification système, reset.
 *  - Les sous-composants sont autonomes et re-rendent seuls.
 */
export function BuildCenter({ project }: Props) {
  const settings = useSettings();
  const [runner, setRunner] = useState<OperationRunner | null>(null);
  const snap = useOperationSnapshot(runner);
  const [now, setNow] = useState<number>(() => performance.now());
  const recordedRef = useRef<string | null>(null);

  // Chronomètre à 1Hz — suffit pour l'affichage humain, économe en CPU.
  useEffect(() => {
    if (snap.status !== "running") return;
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [snap.status]);

  // Statistiques historiques (durée moyenne, dernier build).
  const stats = useMemo(
    () => OperationEstimator.stats(project.id, "build"),
    [project.id, snap.status],
  );

  // Temps écoulé : depuis startedAt jusqu'à endedAt (fin) ou now (live).
  const elapsedMs =
    snap.startedAt != null
      ? (snap.endedAt ?? now) - snap.startedAt
      : 0;

  // Enregistre à la fin (une seule fois par run).
  useEffect(() => {
    if (!snap.startedAt || snap.status === "running" || snap.status === "idle") return;
    if (recordedRef.current === snap.id) return;
    recordedRef.current = snap.id;

    const durationMs = (snap.endedAt ?? performance.now()) - snap.startedAt;
    const artifact = snap.result as { aabPath?: string; aabSize?: number } | undefined;

    if (snap.status === "success") {
      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: project.currentVersion,
        build: project.currentBuild,
        user: settings.userName || "vous",
        durationMs,
        outcome: "success",
        message: "Construction Android",
        kind: "build",
        artifactPath: artifact?.aabPath,
        artifactSizeBytes: artifact?.aabSize,
      });
      notify("Build terminé", `${project.name} · ${artifact?.aabPath ? artifact.aabPath.split(/[\\/]/).pop() : "artefact prêt"}`);
      toast.success("Build terminé", {
        description: artifact?.aabPath?.split(/[\\/]/).pop(),
      });
      AppStore.refreshProjects();
    } else if (snap.status === "error") {
      const err = translateError(snap.error);
      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: project.currentVersion,
        build: project.currentBuild,
        user: settings.userName || "vous",
        durationMs,
        outcome: "failure",
        message: err.title,
        kind: "build",
      });
      notify("Build échoué", err.title);
    } else if (snap.status === "cancelled") {
      notify("Build annulé", `${project.name}`);
    }
  }, [snap.status, snap.id, snap.endedAt, snap.startedAt, snap.result, snap.error, project, settings.userName]);

  const start = useCallback(async () => {
    // Sauvegarde préalable (si activée) — même contrat qu'avant.
    if (settings.autoBackupEnabled) {
      try {
        await BackupService.create(project, "build");
      } catch {
        /* silencieux : la sauvegarde ne bloque jamais un build */
      }
    }
    requestNotificationPermission();
    const r = new OperationRunner(createAndroidBuildOperation(project));
    setRunner(r);
    void r.run();
  }, [project, settings.autoBackupEnabled]);

  const cancel = useCallback(() => {
    runner?.cancel();
  }, [runner]);

  const reset = useCallback(() => {
    setRunner(null);
    recordedRef.current = null;
  }, []);

  const translated = snap.status === "error" ? translateError(snap.error) : null;

  return (
    <div className="space-y-4">
      <BuildCenterHeader
        project={project}
        snap={runner ? snap : null}
        elapsedMs={elapsedMs}
        onStart={start}
        onCancel={cancel}
        onReset={reset}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          {runner ? (
            <>
              <ProgressPanel snap={snap} elapsedMs={elapsedMs} stats={stats} />
              {snap.status === "running" && (
                <LiveStatus step={snap.steps.find((s) => s.status === "running")} />
              )}
              <StepsTimeline steps={snap.steps} nowMs={now} />
              {snap.status === "running" && <BuildTips />}
            </>
          ) : (
            <IntroCard />
          )}

          {snap.status === "success" && (
            <ResultCard project={project} snap={snap} elapsedMs={elapsedMs} stats={stats} />
          )}

          {translated && (
            <BuildErrorPanel error={translated} onRetry={reset} />
          )}
        </div>

        <SidePanel
          project={project}
          settings={settings}
          snap={runner ? snap : null}
          stats={stats}
        />
      </div>

      {runner && <LogConsole logs={snap.logs} mode={settings.mode} />}
    </div>
  );
}

function IntroCard() {
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background p-8 text-center shadow-soft">
      <div className="mx-auto max-w-md">
        <h2 className="text-xl font-semibold">Prêt à construire.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          AppPublisher va préparer votre projet, compiler l'application web,
          synchroniser Android puis produire le fichier .aab prêt à envoyer sur Google Play.
          Vous pouvez annuler à tout moment.
        </p>
      </div>
    </div>
  );
}

// ---------- Notifications système ----------

function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    try {
      void Notification.requestPermission();
    } catch {
      /* certains navigateurs exigent un contexte utilisateur */
    }
  }
}

function notify(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body });
  } catch {
    /* pas critique */
  }
}
