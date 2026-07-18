import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, ChevronRight, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WhyButton } from "@/components/why-button";
import { CopilotService } from "@/core/copilot/service";
import type { HealthCheck, Project, PublishRecord } from "@/core/types";
import type { ProjectStatus, RuleFinding } from "@/core/projects/status";
import { useCockpitNav } from "./cockpit-nav";

/**
 * Carte principale du cockpit. Priorité à une règle bloquante avec action
 * cockpit-locale (résolution immédiate), puis fallback sur CopilotService
 * qui reste la source de vérité pour les recommandations plus globales.
 */
export function NextActionCard({
  project,
  status,
  checks,
  history,
  loading,
}: {
  project: Project;
  status: ProjectStatus;
  checks: HealthCheck[];
  history: PublishRecord[];
  loading?: boolean;
}) {
  const nav = useCockpitNav();

  if (loading) {
    return (
      <Card className="p-6 shadow-soft border-primary/30 bg-primary/5">
        <div className="flex items-start gap-4">
          <div className="h-11 w-11 rounded-full bg-primary/20 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-primary/20 animate-pulse" />
            <div className="h-5 w-64 rounded bg-primary/20 animate-pulse" />
            <div className="h-4 w-full max-w-md rounded bg-muted animate-pulse" />
          </div>
        </div>
      </Card>
    );
  }

  // 1. Une règle bloquante avec action locale prime toujours : l'utilisateur
  // n'a pas besoin d'ouvrir un autre écran pour corriger le problème.
  const topFinding = pickTopActionableFinding(status.findings);
  if (topFinding && topFinding.action) {
    const finding = topFinding;
    const action = topFinding.action;
    return (
      <Card
        className={
          "p-6 shadow-soft transition-colors " +
          (finding.severity === "error"
            ? "border-danger/30 bg-danger/5"
            : "border-warning/30 bg-warning/5")
        }
      >
        <div className="flex items-start gap-4">
          <div
            className={
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
              (finding.severity === "error"
                ? "bg-danger text-danger-foreground"
                : "bg-warning text-warning-foreground")
            }
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={
                "text-xs uppercase tracking-wide font-medium " +
                (finding.severity === "error"
                  ? "text-danger/80"
                  : "text-warning/80")
              }
            >
              Prochaine action
            </div>
            <div className="mt-1 text-lg font-semibold">{finding.message}</div>
            {finding.explanation && (
              <p className="mt-1 text-sm text-muted-foreground">
                {finding.explanation}
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={() => nav.runAction(action)}>
                {action.label}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // 2. Sinon, on suit la recommandation du Copilot (source unique).
  const suggestion = CopilotService.suggest({ project, checks, history });
  const eta = CopilotService.estimatePublishMinutes(checks);
  const isReady = suggestion.action.kind === "prepare-publish";

  return (
    <Card
      className={
        "p-6 shadow-soft transition-colors " +
        (isReady
          ? "border-success/30 bg-success/5"
          : "border-primary/30 bg-primary/5")
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full " +
            (isReady
              ? "bg-success text-success-foreground"
              : "bg-primary text-primary-foreground")
          }
        >
          {isReady ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Sparkles className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={
              "text-xs uppercase tracking-wide font-medium " +
              (isReady ? "text-success/80" : "text-primary/80")
            }
          >
            Prochaine action
          </div>
          <div className="mt-1 text-lg font-semibold">{suggestion.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {suggestion.reason}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {suggestion.action.to ? (
              <Button asChild>
                <Link to={suggestion.action.to as never}>
                  {suggestion.action.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button>{suggestion.action.label}</Button>
            )}
            {suggestion.why && (
              <WhyButton title="Pourquoi cette suggestion ?">
                {suggestion.why}
              </WhyButton>
            )}
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-background px-3 py-1 text-xs text-muted-foreground ring-1 ring-border">
              <Clock className="h-3 w-3" />
              Publication estimée : {eta} min
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

/**
 * Sélection : d'abord les erreurs avec action, puis les warnings avec action.
 * Les findings sans action ne sont pas exécutables depuis le cockpit et sont
 * donc laissés au copilote global.
 */
function pickTopActionableFinding(findings: RuleFinding[]): RuleFinding | null {
  const errored = findings.find((f) => f.severity === "error" && f.action);
  if (errored) return errored;
  const warned = findings.find((f) => f.severity === "warn" && f.action);
  return warned ?? null;
}
