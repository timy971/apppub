import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, Clock, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetupAssistant } from "@/components/setup-assistant/setup-context";
import type { CopilotPlan } from "@/core/copilot/types";

/**
 * NextStepCard — LA carte principale du Dashboard.
 * Une seule action. La meilleure. Lisible en moins de 5 secondes.
 *
 * Répond aux 4 questions UX :
 *  - Que se passe-t-il ? (headline)
 *  - Pourquoi ?          (summary)
 *  - Que faire ?         (nextAction)
 *  - Ensuite ?           (ETA publication)
 */
export function NextStepCard({
  plan,
  loading,
}: {
  plan: CopilotPlan | null;
  loading: boolean;
}) {
  const tone =
    plan?.overallStatus === "blocked"
      ? "border-danger/40 from-danger/8"
      : plan?.overallStatus === "attention"
        ? "border-warning/40 from-warning/8"
        : "border-primary/40 from-primary/8";
  const ring =
    plan?.overallStatus === "blocked"
      ? "bg-danger text-danger-foreground"
      : plan?.overallStatus === "attention"
        ? "bg-warning text-warning-foreground"
        : "bg-primary text-primary-foreground";

  return (
    <Card
      className={
        "relative overflow-hidden p-8 shadow-elevated border bg-gradient-to-br via-transparent to-transparent " +
        tone
      }
    >
      <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-start gap-5">
        <div
          className={
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-soft " +
            ring
          }
        >
          <Sparkles className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            Prochaine étape
          </div>
          {loading || !plan ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-9 w-40 mt-3" />
            </div>
          ) : (
            <>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {plan.nextAction.title}
              </h2>
              <p className="mt-1.5 text-[15px] text-muted-foreground max-w-2xl">
                {plan.headline}. {plan.nextAction.description}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Button asChild size="lg">
                  <Link to={plan.nextAction.route as never}>
                    {plan.nextAction.title}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <AssistantButton />
                <span className="inline-flex items-center gap-1.5 rounded-full bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground ring-1 ring-border">
                  <Clock className="h-3 w-3" />
                  Publication estimée : {plan.etaMinutes} min
                </span>
                <span
                  className={
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ring-1 " +
                    (plan.overallStatus === "ready"
                      ? "bg-success/10 text-success ring-success/30"
                      : plan.overallStatus === "attention"
                        ? "bg-warning/10 text-warning ring-warning/30"
                        : "bg-danger/10 text-danger ring-danger/30")
                  }
                >
                  Score {plan.score}/100
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function AssistantButton() {
  const assistant = useSetupAssistant();
  return (
    <Button variant="outline" size="lg" onClick={() => assistant.open()}>
      <Wand2 className="h-4 w-4" />
      Ouvrir l'assistant
    </Button>
  );
}
