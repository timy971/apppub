import { useNavigate } from "@tanstack/react-router";
import { Sparkles, AlertTriangle, CircleX, ArrowRight, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { CopilotPlan } from "@/core/copilot/types";
import type { Project } from "@/core/types";

/**
 * Bandeau supérieur du Publish Center alimenté exclusivement par le Copilot.
 * Aucun recalcul local de blocages : la source de vérité est le plan.
 *
 * La navigation passe par `useNavigate` : `plan.nextAction.route` peut
 * contenir des segments dynamiques (`/projects/$id`) qui exigent des
 * `params`. Un `<Link to={route as never}>` sans params génère une URL
 * littérale invalide et la navigation échoue silencieusement.
 */
export function PublishCopilotStrip({
  plan,
  project,
}: {
  plan: CopilotPlan;
  project?: Project;
}) {
  const navigate = useNavigate();
  const tone =
    plan.overallStatus === "blocked"
      ? {
          bg: "bg-danger/8 border-danger/30",
          badge: "bg-danger text-danger-foreground",
          Icon: CircleX,
        }
      : plan.overallStatus === "attention"
        ? {
            bg: "bg-warning/8 border-warning/30",
            badge: "bg-warning text-warning-foreground",
            Icon: AlertTriangle,
          }
        : {
            bg: "bg-success/8 border-success/30",
            badge: "bg-success text-success-foreground",
            Icon: Check,
          };

  const goNext = () => {
    const route = plan.nextAction.route;
    // Résout les segments dynamiques connus (uniquement `$id` pour le moment).
    if (route.includes("$id")) {
      if (!project) return;
      void navigate({
        to: "/projects/$id",
        params: { id: project.id },
        search: plan.nextAction.cockpitTab
          ? { tab: plan.nextAction.cockpitTab }
          : undefined,
      });
      return;
    }
    void navigate({ to: route as never });
  };

  return (
    <Card className={"p-4 shadow-soft border " + tone.bg}>
      <div className="flex flex-wrap items-center gap-4">
        <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " + tone.badge}>
          <tone.Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Copilot
          </div>
          <div className="mt-0.5 text-sm font-semibold truncate">{plan.headline}</div>
          <div className="text-xs text-muted-foreground truncate">{plan.summary}</div>
        </div>
        <button
          type="button"
          onClick={goNext}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 shrink-0"
        >
          {plan.nextAction.title}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

