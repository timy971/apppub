import type { CopilotRule } from "../types";

export const buildRule: CopilotRule = {
  id: "build",
  evaluate(ctx) {
    const { project, history } = ctx;
    if (!project) return null;
    const projectHistory = history.filter((h) => h.projectId === project.id);
    const builds = projectHistory.filter((h) => h.kind === "build");
    if (builds.length === 0) return null;

    const last = builds[0];
    if (last.outcome === "failure") {
      return {
        id: "build.last-failed",
        kind: "blocking",
        priority: 25,
        headline: "Le dernier build a échoué",
        description: last.message ?? "Consultez les logs pour comprendre l'erreur.",
        action: {
          title: "Ouvrir le Build Center",
          description: "Relancer un build en connaissance de cause.",
          route: "/build",
          priority: "high",
        },
      };
    }

    const fresh =
      last.version === project.currentVersion &&
      last.build === project.currentBuild;

    if (fresh) {
      // Alerte informative si le build courant est nettement plus long
      // que la moyenne (>50% au-dessus).
      const successful = builds.filter((b) => b.outcome === "success" && b.durationMs > 0);
      if (successful.length >= 3) {
        const avg =
          successful.reduce((s, b) => s + b.durationMs, 0) / successful.length;
        if (last.durationMs > avg * 1.5) {
          return [
            {
              id: "build.fresh",
              kind: "success",
              priority: 930,
              headline: "Fichier d'application prêt à publier",
              completedStepId: "build",
            },
            {
              id: "build.slower",
              kind: "information",
              priority: 800,
              headline: "Votre dernier build est plus lent que d'habitude.",
              description: `${Math.round(last.durationMs / 60000)} min contre ${Math.round(avg / 60000)} min en moyenne.`,
            },
          ];
        }
      }
      return {
        id: "build.fresh",
        kind: "success",
        priority: 930,
        headline: "Fichier d'application prêt à publier",
        completedStepId: "build",
      };
    }

    return null;
  },
};
