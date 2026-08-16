import { ArrowRight, Check, ChevronDown, CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { CopilotActionLink } from "@/components/copilot-action-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotPlan } from "@/core/copilot/types";
import type { Project } from "@/core/types";
import type { PublicationJourneyPath } from "@/core/types";
import { JOURNEY_LABELS } from "@/core/navigation/journey-progress";
import { cn } from "@/lib/utils";

function greeting(name: string): string {
  const firstName = name.trim() || "vous";
  const hour = new Date().getHours();
  if (hour < 6) return `Bonne nuit ${firstName}`;
  if (hour < 12) return `Bonjour ${firstName}`;
  if (hour < 18) return `Bon après-midi ${firstName}`;
  return `Bonsoir ${firstName}`;
}

function statusLabel(plan: CopilotPlan, project?: Project): string {
  if (!project) return "À démarrer";
  if (plan.overallStatus === "blocked") return "Action nécessaire";
  if (plan.overallStatus === "attention") return "À vérifier";
  return "En bonne voie";
}

export function DashboardFocusCard({
  plan,
  project,
  userName,
  loading,
  lastJourneyPath,
}: {
  plan: CopilotPlan | null;
  project?: Project;
  userName: string;
  loading: boolean;
  lastJourneyPath?: PublicationJourneyPath;
}) {
  const date = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (loading || !plan) {
    return (
      <Card className="p-7 shadow-elevated sm:p-9">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-9 w-72 max-w-full" />
        <Skeleton className="mt-7 h-6 w-52" />
        <Skeleton className="mt-3 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-6 h-11 w-52" />
      </Card>
    );
  }

  const currentIndex = Math.max(
    0,
    plan.steps.findIndex((step) => step.status === "current" || step.status === "blocked"),
  );
  const completedCount = plan.steps.filter((step) => step.status === "done").length;
  const completedStepsLabel = `${completedCount} étape${completedCount > 1 ? "s" : ""} terminée${completedCount > 1 ? "s" : ""}`;
  const warningsLabel = `${plan.warnings.length} point${plan.warnings.length > 1 ? "s" : ""} à vérifier`;
  const readyLabel = `${plan.completed.length} élément${plan.completed.length > 1 ? "s" : ""} prêt${plan.completed.length > 1 ? "s" : ""}`;
  const tone =
    project && plan.overallStatus === "blocked"
      ? "border-danger/40 from-danger/8"
      : project && plan.overallStatus === "attention"
        ? "border-warning/40 from-warning/8"
        : "border-primary/40 from-primary/8";

  return (
    <Card
      className={cn(
        "relative overflow-hidden border bg-gradient-to-br via-transparent to-transparent p-7 shadow-elevated sm:p-9",
        tone,
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative">
        <p className="text-xs capitalize text-muted-foreground">{date}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{greeting(userName)}</h1>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/80 text-2xl ring-1 ring-border">
            {project?.logoEmoji ?? "📱"}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {project ? "Application active" : "Commencez ici"}
            </div>
            <div className="truncate text-lg font-semibold">
              {project?.name ?? "Votre première application"}
            </div>
            {project && (
              <div className="text-xs text-muted-foreground">
                Version {project.currentVersion} · nº interne {project.currentBuild}
              </div>
            )}
          </div>
          <span
            className={cn(
              "ml-auto rounded-full px-3 py-1 text-xs font-medium ring-1",
              !project && "bg-primary/10 text-primary ring-primary/30",
              project &&
                plan.overallStatus === "ready" &&
                "bg-success/10 text-success ring-success/30",
              project &&
                plan.overallStatus === "attention" &&
                "bg-warning/10 text-warning ring-warning/30",
              project &&
                plan.overallStatus === "blocked" &&
                "bg-danger/10 text-danger ring-danger/30",
            )}
          >
            {statusLabel(plan, project)}
          </span>
        </div>

        {project && (
          <div className="mt-7" aria-label={`Étape ${currentIndex + 1} sur ${plan.steps.length}`}>
            <div className="mb-2 flex items-center justify-between gap-4 text-xs">
              <span className="font-medium">
                Étape {currentIndex + 1} sur {plan.steps.length} · {plan.steps[currentIndex]?.title}
              </span>
              <span className="text-muted-foreground">{completedStepsLabel}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5" aria-hidden="true">
              {plan.steps.map((step) => (
                <span
                  key={step.id}
                  className={cn(
                    "h-1.5 rounded-full",
                    step.status === "done" && "bg-success",
                    step.status === "current" && "bg-primary",
                    step.status === "blocked" && "bg-danger",
                    step.status === "upcoming" && "bg-muted",
                  )}
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-7 max-w-3xl" role="status" aria-live="polite">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Votre prochaine action
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{plan.nextAction.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            {plan.nextAction.description}
          </p>
          <Button asChild size="lg" className="mt-5">
            <CopilotActionLink action={plan.nextAction} projectId={project?.id}>
              {plan.nextAction.title}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </CopilotActionLink>
          </Button>
          {project && lastJourneyPath && lastJourneyPath !== plan.nextAction.route && (
            <Button asChild variant="ghost" className="ml-2 mt-5">
              <Link to={lastJourneyPath}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reprendre : {JOURNEY_LABELS[lastJourneyPath]}
              </Link>
            </Button>
          )}
        </div>

        {project && (plan.warnings.length > 0 || plan.completed.length > 0) && (
          <details className="group mt-7 border-t pt-5">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              Voir l'état détaillé
              <span className="font-normal">
                · {warningsLabel} · {readyLabel}
              </span>
            </summary>
            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <CircleAlert className="h-4 w-4 text-warning" />À vérifier
                </h3>
                {plan.warnings.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Aucun blocage détecté.</p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {plan.warnings.slice(0, 3).map((warning) => (
                      <li key={warning.id}>
                        {warning.route ? (
                          <CopilotActionLink
                            action={{
                              route: warning.route,
                              cockpitTab: warning.cockpitTab,
                              cockpitField: warning.cockpitField,
                            }}
                            projectId={project.id}
                            className="block rounded-lg bg-background/70 p-3 hover:bg-background"
                          >
                            <span className="font-medium">{warning.title}</span>
                            {warning.description && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {warning.description}
                              </span>
                            )}
                          </CopilotActionLink>
                        ) : (
                          <span>{warning.title}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Check className="h-4 w-4 text-success" />
                  Déjà prêt
                </h3>
                {plan.completed.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Les validations apparaîtront au fur et à mesure.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm">
                    {plan.completed.slice(0, 5).map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </details>
        )}
      </div>
    </Card>
  );
}
