import type { CopilotRule } from "../types";

export const versionRule: CopilotRule = {
  id: "version",
  evaluate(ctx) {
    const { project, history } = ctx;
    if (!project) return null;
    const projectHistory = history.filter((h) => h.projectId === project.id);
    const lastBuild = projectHistory.find((h) => h.kind === "build");
    const lastVersion = projectHistory.find((h) => h.kind === "version");

    // Jamais versionné → étape « version » à faire.
    if (!lastVersion && !lastBuild) {
      return {
        id: "version.first",
        kind: "warning",
        priority: 45,
        headline: "Préparez votre première version",
        description:
          "Choisissez le type de changement (correction, ajout, refonte) pour créer la première version publiable.",
        action: {
          title: "Modifier la version",
          description: "Décidez du prochain numéro de version.",
          route: "/version",
          priority: "medium",
        },
      };
    }

    // Nouvelle version définie mais pas encore construite.
    const hasVersionSinceBuild =
      lastVersion && (!lastBuild || lastVersion.createdAt > lastBuild.createdAt);
    if (hasVersionSinceBuild) {
      return {
        id: "version.needs-build",
        kind: "warning",
        priority: 50,
        headline: `La version ${project.currentVersion} n'a pas encore été construite`,
        description:
          "Google Play accepte uniquement un fichier .aab construit pour la version en cours.",
        action: {
          title: "Construire Android",
          description: "Lancer la construction depuis le Build Center.",
          route: "/build",
          priority: "medium",
        },
      };
    }

    return {
      id: "version.ok",
      kind: "success",
      priority: 920,
      headline: `Version ${project.currentVersion} (build ${project.currentBuild})`,
      completedStepId: "version",
    };
  },
};
