import { Link } from "@tanstack/react-router";
import { AlertTriangle, CircleX, ArrowRight, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CopilotPlan } from "@/core/copilot/types";

/**
 * BlockersCard — au plus 3 points bloquants ou en attention.
 * Chaque élément est cliquable et pointe vers l'écran/onglet qui résout.
 */
export function BlockersCard({
  plan,
  loading,
}: {
  plan: CopilotPlan | null;
  loading: boolean;
}) {
  if (loading || !plan) {
    return (
      <Card className="p-6 shadow-soft">
        <SectionTitle icon={AlertTriangle}>Ce qui bloque</SectionTitle>
        <div className="mt-4 space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const items = plan.warnings.slice(0, 3);

  if (items.length === 0) {
    return (
      <Card className="p-6 shadow-soft">
        <SectionTitle icon={Shield}>Aucun blocage</SectionTitle>
        <p className="mt-3 text-sm text-muted-foreground">
          Aucun point bloquant. Vous pouvez avancer sereinement.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-soft">
      <SectionTitle icon={AlertTriangle}>Ce qui bloque</SectionTitle>
      <ul className="mt-3 space-y-2">
        {items.map((it) => {
          const isBlocking = it.kind === "blocking";
          const inner = (
            <div className="flex items-start gap-3">
              <div
                className={
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full " +
                  (isBlocking
                    ? "bg-danger/15 text-danger"
                    : "bg-warning/15 text-warning")
                }
              >
                {isBlocking ? (
                  <CircleX className="h-3.5 w-3.5" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {it.title}
                </div>
                {it.description && (
                  <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                    {it.description}
                  </div>
                )}
              </div>
              {it.route && <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </div>
          );
          return (
            <li key={it.id}>
              {it.route ? (
                <Link
                  to={it.route as never}
                  className="block rounded-lg p-2 -mx-2 transition-colors hover:bg-muted/60"
                >
                  {inner}
                </Link>
              ) : (
                <div className="p-2 -mx-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h3>
    </div>
  );
}
