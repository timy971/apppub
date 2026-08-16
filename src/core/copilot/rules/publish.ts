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

    const lastStorePublish = projectHistory.find(
      (h) => h.kind === "publish" && h.outcome === "success" && h.storeRelease,
    );
    const lastPreparation = projectHistory.find(
      (h) =>
        (h.kind === "release-prepared" || (h.kind === "publish" && !h.storeRelease)) &&
        h.outcome === "success",
    );

    const alreadyPublishedForThisVersion =
      lastStorePublish &&
      lastStorePublish.version === project.currentVersion &&
      lastStorePublish.build === project.currentBuild;

    if (alreadyPublishedForThisVersion) {
      return {
        id: "publish.sent",
        kind: "success",
        priority: 950,
        headline: `Version ${project.currentVersion} envoyée à Google Play`,
        completedStepId: "publish",
      };
    }

    const alreadyPreparedForThisVersion =
      lastPreparation &&
      lastPreparation.version === project.currentVersion &&
      lastPreparation.build === project.currentBuild;

    if (alreadyPreparedForThisVersion) {
      return {
        id: "publish.prepared",
        kind: "information",
        priority: 85,
        headline: `Version ${project.currentVersion} prête à être envoyée`,
        description: "La préparation est terminée, mais rien n'a encore été envoyé à Google Play.",
        action: {
          title: "Envoyer à Google Play",
          description: "Vérifier la connexion puis confirmer l'envoi aux testeurs internes.",
          route: "/publish",
          priority: "high",
        },
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
