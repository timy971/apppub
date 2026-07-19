import { Link } from "@tanstack/react-router";
import { Sparkles, ArrowRight, Check, AlertTriangle, CircleX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CopilotPlan } from "@/core/copilot/types";

/**
 * PlanCard — carte "Plan d'action" affichée dans le Cockpit projet.
 * Consomme exactement les mêmes données que le Dashboard (aucune duplication).
 */
export function PlanCard({ plan }: { plan: CopilotPlan }) {
  const ring =
    plan.overallStatus === "blocked"
      ? "bg-danger text-danger-foreground"
      : plan.overallStatus === "attention"
        ? "bg-warning text-warning-foreground"
        : "bg-primary text-primary-foreground";
  return (
    <Card className="p-5 shadow-soft">
      <div className="flex items-start gap-4">
        <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + ring}>
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
              Plan d'action du Copilot
            </div>
            <span
              className={
                "text-xs font-medium rounded-full px-2 py-0.5 ring-1 " +
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
          <div className="mt-1 text-base font-semibold">{plan.headline}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">{plan.summary}</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniList
              title="À faire"
              icon={CircleX}
              tone="danger"
              items={plan.warnings.filter((w) => w.kind === "blocking").slice(0, 3)}
            />
            <MiniList
              title="À surveiller"
              icon={AlertTriangle}
              tone="warning"
              items={plan.warnings.filter((w) => w.kind === "warning").slice(0, 3)}
            />
          </div>

          {plan.completed.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {plan.completed.slice(0, 4).map((c) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] text-success"
                >
                  <Check className="h-3 w-3" />
                  {c}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <Button asChild size="sm">
              <Link to={plan.nextAction.route as never}>
                {plan.nextAction.title}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function MiniList({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "danger" | "warning";
  items: { id: string; title: string }[];
}) {
  const color = tone === "danger" ? "text-danger" : "text-warning";
  return (
    <div>
      <div className={"flex items-center gap-1.5 text-xs font-semibold " + color}>
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-1 text-xs text-muted-foreground">Rien à signaler.</div>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {items.map((it) => (
            <li key={it.id} className="text-xs text-foreground truncate">
              • {it.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
