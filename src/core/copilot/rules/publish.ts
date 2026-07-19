import type { CopilotRule } from "../types";

/**
 * Recommandation finale « préparer la publication ».
 * Ne se déclenche que si la configuration est saine ET qu'un build frais existe.
 */
export const publishRule: CopilotRule = {
  id: "publish",
  evaluate(ctx) {
    const { project, status, history } = ctx;
    if (!project || !status) return null;
    if (status.level === "blocked") return null;

    const projectHistory = history.filter((h) => h.projectId === project.id);
    const lastBuild = projectHistory.find((h) => h.kind === "build");
    const hasFreshBuild =
      lastBuild &&
      lastBuild.outcome === "success" &&
      lastBuild.version === project.currentVersion &&
      lastBuild.build === project.currentBuild;

    if (!hasFreshBuild) return null;

    const lastPublish = projectHistory.find(
      (h) => h.kind === "publish" && h.outcome === "success",
    );

    const alreadyPreparedForThisVersion =
      lastPublish &&
      lastPublish.version === project.currentVersion &&
      lastPublish.build === project.currentBuild;

    if (alreadyPreparedForThisVersion) {
      return {
        id: "publish.prepared",
        kind: "success",
        priority: 940,
        headline: `Publication préparée pour la version ${project.currentVersion}`,
        completedStepId: "publish",
      };
    }

    return {
      id: "publish.ready",
      kind: "success",
      priority: 90,
      headline: "Votre application est prête à être publiée",
      description:
        "L'assistant vérifiera une dernière fois vos notes de version puis enregistrera la préparation.",
      action: {
        title: "Préparer la publication",
        description: "Ouvrir le Publish Center.",
        route: "/publish",
        priority: "high",
      },
    };
  },
};
