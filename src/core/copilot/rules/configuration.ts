import type { CopilotRecommendation, CopilotRule } from "../types";

/**
 * Rejoue les findings de ProjectStatusService et les convertit en
 * recommandations Copilot. Aucune logique métier locale — on utilise la
 * source de vérité déjà en place.
 */
export const configurationRule: CopilotRule = {
  id: "configuration",
  evaluate(ctx) {
    const { status, project } = ctx;
    if (!status || !project) return null;

    const recs: CopilotRecommendation[] = [];
    for (const f of status.findings) {
      const isConfigDomain =
        f.domain === "android" ||
        f.domain === "ios" ||
        f.domain === "identity" ||
        f.domain === "git";

      if (!isConfigDomain && f.domain !== "version") continue;

      const priorityBase = f.severity === "error" ? 20 : f.severity === "warn" ? 60 : 200;
      // Version = étape 2 du cycle : légèrement moins prioritaire qu'un
      // blocage de configuration.
      const priority =
        priorityBase +
        (f.domain === "version" ? 5 : f.domain === "ios" ? 3 : 0);

      recs.push({
        id: `configuration.${f.id}`,
        kind: f.severity === "error" ? "blocking" : f.severity === "warn" ? "warning" : "information",
        priority,
        headline: f.message,
        description: f.explanation ?? f.hint,
        action: f.action
          ? {
              title: f.action.label,
              description: f.explanation ?? f.hint ?? "Corriger dans le cockpit.",
              route: "/projects/$id",
              priority: f.severity === "error" ? "high" : "medium",
              cockpitTab: f.action.tab,
            }
          : undefined,
      });
    }
    return recs;
  },
};
