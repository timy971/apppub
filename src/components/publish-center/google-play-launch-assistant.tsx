import { CheckCircle2, ClipboardCopy, ExternalLink, Info, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { bridge } from "@/core/bridge";
import {
  GOOGLE_PLAY_LAUNCH_PHASES,
  GOOGLE_PLAY_LAUNCH_TASKS,
  googlePlayLaunchProgress,
  normalizeGooglePlayLaunchPlan,
  toggleGooglePlayLaunchTask,
} from "@/core/google-play/launch-plan";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { AppStore } from "@/core/store/app-store";
import type { GooglePlayLaunchTaskId, Project } from "@/core/types";
import { cn } from "@/lib/utils";

const PLAY_CONSOLE_URL = "https://play.google.com/console/";

interface Props {
  project: Project;
  packageName: string;
  internalReleaseReady: boolean;
  onChanged: () => void;
}

export function GooglePlayLaunchAssistant({
  project,
  packageName,
  internalReleaseReady,
  onChanged,
}: Props) {
  const plan = normalizeGooglePlayLaunchPlan(project.publishing?.android?.googlePlayLaunchPlan);
  const progress = googlePlayLaunchProgress(plan);
  const currentPhase = progress.nextTask?.phase;

  async function openPlayConsole() {
    try {
      const opened = await bridge().shell.openExternal(PLAY_CONSOLE_URL);
      if (!opened) toast.error("Impossible d’ouvrir Google Play Console");
    } catch {
      toast.error("Impossible d’ouvrir Google Play Console");
    }
  }

  async function copyPackageName() {
    const copied = await bridge().system.copyText(packageName);
    if (copied) toast.success("Identifiant Android copié");
    else toast.error("Impossible de copier l’identifiant Android");
  }

  function setTask(taskId: GooglePlayLaunchTaskId, checked: boolean) {
    if (!internalReleaseReady) return;
    try {
      const nextPlan = toggleGooglePlayLaunchTask(plan, taskId, checked);
      const updated = ProjectsService.update(
        project.id,
        patchAndroidConfig(project, { googlePlayLaunchPlan: nextPlan }),
      );
      if (!updated) throw new Error("Projet introuvable");
      AppStore.refreshProjects();
      onChanged();
      toast.success(checked ? "Étape marquée comme terminée" : "Étape rouverte");
    } catch {
      toast.error("La progression n’a pas pu être enregistrée");
    }
  }

  return (
    <section
      aria-labelledby="google-play-public-launch-title"
      className="mt-6 rounded-2xl border bg-muted/10 p-5"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Send className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="google-play-public-launch-title" className="font-semibold">
                Mise en ligne publique
              </h3>
              <Badge
                variant="outline"
                className={cn(progress.complete && "border-success/40 bg-success/10 text-success")}
              >
                {progress.complete ? "Dossier envoyé à Google" : "À préparer dans Play Console"}
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              Le test interne est la première étape, pas la fin. AppPublisher garde maintenant la
              liste exacte de ce qu’il reste à faire pour demander une publication au public.
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => void openPlayConsole()}>
          <ExternalLink className="h-4 w-4" />
          Ouvrir Play Console
        </Button>
      </div>

      {!internalReleaseReady ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-amber-300/70 bg-amber-50/70 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/20">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-medium text-amber-950 dark:text-amber-100">
              Commencez par terminer le test interne juste au-dessus
            </p>
            <p className="mt-1 leading-relaxed text-amber-900/80 dark:text-amber-100/75">
              Dès que cette version est enregistrée chez Google, la checklist publique devient
              active. Vous ne pourrez ainsi pas envoyer au public un fichier qui n’a jamais été
              testé.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-5 rounded-xl border bg-background p-4" aria-live="polite">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {progress.complete
                    ? "Toutes les étapes déclarées sont terminées"
                    : `Prochaine action : ${progress.nextTask?.title}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {progress.completed}/{progress.total} étapes confirmées dans AppPublisher
                </p>
              </div>
              <span className="text-sm font-semibold">{progress.percent} %</span>
            </div>
            <Progress
              className="mt-3"
              value={progress.percent}
              aria-label={`Préparation de la publication publique : ${progress.percent} %`}
            />
            {progress.complete && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-success/10 p-3 text-sm text-success">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Votre dossier a été envoyé pour examen. Il n’est public qu’après l’acceptation
                  affichée dans Play Console.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed bg-background px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Application suivie : <code className="text-foreground">{packageName}</code>
            </span>
            <Button size="sm" variant="ghost" onClick={() => void copyPackageName()}>
              <ClipboardCopy className="h-4 w-4" />
              Copier l’identifiant
            </Button>
          </div>

          <ol className="mt-5 space-y-4">
            {GOOGLE_PLAY_LAUNCH_PHASES.map((phase, phaseIndex) => {
              const tasks = GOOGLE_PLAY_LAUNCH_TASKS.filter((task) => task.phase === phase.id);
              const completedCount = tasks.filter((task) =>
                plan.completedTasks.includes(task.id),
              ).length;
              const phaseComplete = completedCount === tasks.length;
              const phaseCurrent = phase.id === currentPhase;

              return (
                <li
                  key={phase.id}
                  className={cn(
                    "rounded-xl border bg-background p-4",
                    phaseCurrent && "border-primary/50 ring-1 ring-primary/10",
                    phaseComplete && "border-success/30",
                  )}
                >
                  <details open={phaseCurrent || (progress.complete && phase.id === "review")}>
                    <summary className="cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="inline-flex w-[calc(100%-1.5rem)] flex-wrap items-start justify-between gap-3 align-top">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              phaseComplete
                                ? "bg-success/15 text-success"
                                : phaseCurrent
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground",
                            )}
                          >
                            {phaseComplete ? <CheckCircle2 className="h-4 w-4" /> : phaseIndex + 1}
                          </span>
                          <div>
                            <h4 className="text-sm font-medium">{phase.title}</h4>
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {phase.description}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">
                          {completedCount}/{tasks.length}
                        </Badge>
                      </div>
                    </summary>

                    <div className="mt-4 space-y-3 pl-0 sm:pl-10">
                      {tasks.map((task) => {
                        const checked = plan.completedTasks.includes(task.id);
                        const isNext = progress.nextTask?.id === task.id;
                        return (
                          <div
                            key={task.id}
                            className={cn(
                              "rounded-lg border p-3",
                              isNext ? "border-primary/40 bg-primary/5" : "bg-muted/10",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`google-play-launch-${task.id}`}
                                checked={checked}
                                onCheckedChange={(value) => setTask(task.id, value === true)}
                                aria-describedby={`google-play-launch-${task.id}-detail`}
                              />
                              <div className="min-w-0 flex-1">
                                <label
                                  htmlFor={`google-play-launch-${task.id}`}
                                  className="cursor-pointer text-sm font-medium"
                                >
                                  {task.title}
                                </label>
                                {isNext && (
                                  <Badge className="ml-2 bg-primary/10 text-primary hover:bg-primary/10">
                                    À faire maintenant
                                  </Badge>
                                )}
                                <p
                                  id={`google-play-launch-${task.id}-detail`}
                                  className="mt-1 text-xs leading-relaxed text-muted-foreground"
                                >
                                  {task.detail}
                                </p>
                                <details className="mt-2 text-xs text-muted-foreground">
                                  <summary className="cursor-pointer font-medium text-foreground/80">
                                    Comment vérifier ?
                                  </summary>
                                  <p className="mt-1 leading-relaxed">{task.help}</p>
                                </details>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Les cases sont vos confirmations. AppPublisher ne peut pas lire certaines réponses
              réglementaires de Play Console et ne les valide jamais à votre place. Vous pouvez
              décocher une étape pour la reprendre.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
