import { Check, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotPlan } from "@/core/copilot/types";

/**
 * ReadyCard — carte rassurante. Liste des points validés par le Copilot.
 */
export function ReadyCard({
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
        <div className="mt-4 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    );
  }
  const items = plan.completed.slice(0, 6);
  return (
    <Card className="p-6 shadow-soft">
      <Header />
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Les validations apparaîtront ici au fur et à mesure que vous
          configurerez votre projet.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((label) => (
            <li key={label} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span className="text-foreground">{label}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Sparkles className="h-4 w-4 text-success" />
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Ce qui est prêt
      </h3>
    </div>
  );
}
