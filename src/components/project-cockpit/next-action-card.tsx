import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Sparkles, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { WhyButton } from "@/components/why-button";
import { CopilotService } from "@/core/copilot/service";
import type { HealthCheck, Project, PublishRecord } from "@/core/types";
import type { FileRoutesByPath } from "@tanstack/react-router";

/**
 * Carte principale du cockpit. Réutilise CopilotService (aucune logique
 * métier dupliquée) et le contextualise au projet ouvert.
 */
export function NextActionCard({
  project,
  checks,
  history,
  loading,
}: {
  project: Project;
  checks: HealthCheck[];
  history: PublishRecord[];
  loading?: boolean;
}) {
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
              <Button asChild variant={isReady ? "default" : "default"}>
                <Link to={suggestion.action.to as keyof FileRoutesByPath}>
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
