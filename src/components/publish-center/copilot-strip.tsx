import { Sparkles, AlertTriangle, CircleX, ArrowRight, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CopilotPlan } from "@/core/copilot/types";
import type { Project } from "@/core/types";
import { CopilotActionLink } from "@/components/copilot-action-link";

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
  onPrimaryAction,
  primaryActionBusy = false,
}: {
  plan: CopilotPlan;
  project?: Project;
  onPrimaryAction?: () => void;
  primaryActionBusy?: boolean;
}) {
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
        {plan.nextAction.route === "/publish" && onPrimaryAction ? (
          <Button
            size="sm"
            onClick={onPrimaryAction}
            disabled={primaryActionBusy}
            className="shrink-0 bg-foreground text-background hover:bg-foreground/90"
          >
            {primaryActionBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            {plan.nextAction.title}
          </Button>
        ) : (
          <CopilotActionLink
            action={plan.nextAction}
            projectId={project?.id}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 shrink-0"
          >
            {plan.nextAction.title}
            <ArrowRight className="h-3.5 w-3.5" />
          </CopilotActionLink>
        )}
      </div>
    </Card>
  );
}
