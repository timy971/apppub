import type { CopilotRecommendation, CopilotRule } from "../types";

export const historyRule: CopilotRule = {
  id: "history",
  evaluate(ctx) {
    const { project, history } = ctx;
    if (!project) return null;
    const projectHistory = history.filter((h) => h.projectId === project.id);
    const publishes = projectHistory.filter((h) => h.kind === "publish");
    const recs: CopilotRecommendation[] = [];

    if (publishes.length === 0) {
      recs.push({
        id: "history.no-publish",
        kind: "information",
        priority: 500,
        headline: "Cette application n'a jamais été publiée",
        description: "La première publication reste l'étape la plus importante.",
      });
    } else {
      const last = publishes[0];
      recs.push({
        id: "history.last-publish",
        kind: "success",
        priority: 960,
        headline: `Dernière préparation : version ${last.version}`,
      });
    }
    return recs;
  },
};
