import type {
  CopilotSuggestion,
  HealthCheck,
  Project,
  ProjectBackup,
  PublishRecord,
} from "@/core/types";
import { ProjectStatusService } from "@/core/projects/status";
import { buildCopilotPlan } from "./engine";
import type { CopilotPlan, CopilotRuleContext } from "./types";

/**
 * CopilotService — devient un simple agrégateur.
 *
 * Toutes les recommandations passent par `buildCopilotPlan()`. L'API
 * historique (`suggest()`, `estimatePublishMinutes()`) est conservée
 * pour compatibilité, mais délègue au moteur : il n'existe donc PLUS
 * qu'une seule logique de recommandation dans l'application.
 */
export const CopilotService = {
  /** Plan complet. Consommé par le Dashboard, le Cockpit, le Publish Center. */
  plan(input: {
    project: Project | undefined;
    checks: HealthCheck[];
    history: PublishRecord[];
    backups?: ProjectBackup[];
  }): CopilotPlan {
    const ctx: CopilotRuleContext = {
      project: input.project,
      status: input.project ? ProjectStatusService.evaluate(input.project) : null,
      checks: input.checks,
      history: input.history,
      backups: input.backups ?? [],
    };
    return buildCopilotPlan(ctx);
  },

  /** Compatibilité — retourne la Prochaine Meilleure Action au format legacy. */
  suggest(input: {
    project: Project | undefined;
    checks: HealthCheck[];
    history: PublishRecord[];
  }): CopilotSuggestion {
    const plan = this.plan(input);
    return planToSuggestion(plan);
  },

  estimatePublishMinutes(checks: HealthCheck[]): number {
    const errors = checks.filter((c) => c.status === "error").length;
    const warnings = checks.filter((c) => c.status === "warning").length;
    return 6 + errors * 4 + warnings * 1;
  },
};

function planToSuggestion(plan: CopilotPlan): CopilotSuggestion {
  const a = plan.nextAction;
  const priority =
    a.priority === "high" ? 1 : a.priority === "medium" ? 3 : 5;
  const kind = inferKind(a.route);
  return {
    title: a.title,
    reason: plan.headline,
    why: plan.summary,
    action: { kind, label: a.title, to: a.route },
    etaMinutes: plan.etaMinutes,
    priority,
  };
}

function inferKind(route: string): CopilotSuggestion["action"]["kind"] {
  if (route.startsWith("/diagnostic")) return "run-diagnostic";
  if (route.startsWith("/build")) return "build-android";
  if (route.startsWith("/publish")) return "prepare-publish";
  if (route.startsWith("/version")) return "bump-version";
  if (route.startsWith("/projects")) return "add-project";
  return "fix-environment";
}
