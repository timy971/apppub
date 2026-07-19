import type { CopilotRecommendation, CopilotRule } from "../types";

export const diagnosticRule: CopilotRule = {
  id: "diagnostic",
  evaluate(ctx) {
    const errors = ctx.checks.filter((c) => c.status === "error");
    const warnings = ctx.checks.filter((c) => c.status === "warning");
    const recs: CopilotRecommendation[] = [];

    if (errors.length > 0) {
      const first = errors[0];
      recs.push({
        id: `diagnostic.error.${first.id}`,
        kind: "blocking",
        priority: 30,
        headline: first.detail || first.label,
        description:
          first.why ??
          "Cet outil est indispensable pour préparer votre application.",
        action: {
          title: "Voir le diagnostic",
          description: "Ouvre le rapport complet des outils requis.",
          route: "/diagnostic",
          priority: "high",
        },
      });
    } else if (warnings.length > 1) {
      recs.push({
        id: "diagnostic.attention",
        kind: "warning",
        priority: 70,
        headline: "Quelques points à surveiller dans le diagnostic",
        description: `${warnings.length} contrôles ne sont pas au vert.`,
        action: {
          title: "Ouvrir le diagnostic",
          description: "Vérifier les points d'attention.",
          route: "/diagnostic",
          priority: "low",
        },
      });
    } else if (ctx.checks.length > 0) {
      recs.push({
        id: "diagnostic.ok",
        kind: "success",
        priority: 910,
        headline: "Environnement de développement prêt",
      });
    }
    return recs;
  },
};
