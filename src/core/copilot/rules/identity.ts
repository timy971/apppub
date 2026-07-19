import type { CopilotRule } from "../types";

export const identityRule: CopilotRule = {
  id: "identity",
  evaluate(ctx) {
    const { project } = ctx;
    if (!project) {
      return {
        id: "identity.no-project",
        kind: "blocking",
        priority: 5,
        headline: "Ajoutez votre premier projet",
        description: "AppPublisher a besoin d'un projet pour commencer à vous accompagner.",
        action: {
          title: "Ajouter un projet",
          description: "Créez la fiche de votre application.",
          route: "/projects",
          priority: "high",
        },
      };
    }
    if (!project.name.trim()) {
      return {
        id: "identity.no-name",
        kind: "blocking",
        priority: 10,
        headline: "Le nom de l'application est requis",
        description: "Sans nom, la publication ne peut pas aboutir.",
        action: {
          title: "Renseigner le nom",
          description: "Ouvrez l'onglet Identité du cockpit.",
          route: "/projects/$id",
          priority: "high",
          cockpitTab: "identity",
        },
      };
    }
    return {
      id: "identity.ok",
      kind: "success",
      priority: 900,
      headline: `${project.name} est configuré`,
      completedStepId: "project",
    };
  },
};
