import { Check, Circle, Dot, MinusCircle, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotPlan } from "@/core/copilot/types";

/**
 * PlanTimelineCard — chronologie logique du projet.
 * Chaque étape est colorée : done ✓ / current • / upcoming ○ / blocked ⚠.
 */
export function PlanTimelineCard({
  plan,
  loading,
}: {
  plan: CopilotPlan | null;
  loading: boolean;
}) {
  if (loading || !plan) {
    return (
      <Card className="p-6 shadow-soft">
        <Header />
        <div className="mt-4 flex gap-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 flex-1" />
          ))}
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-6 shadow-soft">
      <Header />
      <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {plan.steps.map((step, idx) => {
          const isLast = idx === plan.steps.length - 1;
          const Icon =
            step.status === "done"
              ? Check
              : step.status === "current"
                ? Dot
                : step.status === "blocked"
                  ? MinusCircle
                  : Circle;
          const color =
            step.status === "done"
              ? "bg-success/15 text-success ring-success/30"
              : step.status === "current"
                ? "bg-primary/15 text-primary ring-primary/30"
                : step.status === "blocked"
                  ? "bg-danger/15 text-danger ring-danger/30"
                  : "bg-muted text-muted-foreground ring-border";
          return (
            <li key={step.id} className="relative flex flex-col items-start gap-2">
              <div className="flex items-center gap-2 w-full">
                <div
                  className={
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 " +
                    color
                  }
                >
                  <Icon className="h-4 w-4" />
                </div>
                {!isLast && (
                  <ArrowRight className="hidden sm:block h-3 w-3 text-muted-foreground/60 ml-auto" />
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Étape {idx + 1}
                </div>
                <div className="text-sm font-medium truncate">{step.title}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Chronologie
      </h3>
    </div>
  );
}
