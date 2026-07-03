import type {
  CopilotSuggestion,
  HealthCheck,
  Project,
  PublishRecord,
} from "@/core/types";
import { HealthScoreService } from "@/core/health/service";

/**
 * CopilotService — propose la prochaine action pertinente.
 * Le résultat est **déterministe** (règles + priorités), aucune IA en ligne.
 * L'objectif est d'être un copilote transparent : chaque suggestion vient
 * avec une explication (`reason`) et un « pourquoi ? » pédagogique.
 */
export const CopilotService = {
  suggest(input: {
    project: Project | undefined;
    checks: HealthCheck[];
    history: PublishRecord[];
  }): CopilotSuggestion {
    const { project, checks, history } = input;

    if (!project) {
      return {
        title: "Ajoutez votre premier projet",
        reason: "AppPublisher a besoin d'un projet pour commencer à vous accompagner.",
        why: "Un projet correspond à une application. Vous pouvez en gérer plusieurs.",
        action: { kind: "add-project", label: "Ajouter un projet", to: "/projects" },
        etaMinutes: 2,
        priority: 1,
      };
    }

    const score = HealthScoreService.from(checks);

    if (score.grade === "blocked") {
      const first = checks.find((c) => c.status === "error");
      return {
        title: "Une action est nécessaire",
        reason: first?.detail ?? "Un élément indispensable est manquant.",
        why: first?.why,
        action: { kind: "fix-environment", label: "Voir le diagnostic", to: "/diagnostic" },
        etaMinutes: 5,
        priority: 1,
      };
    }

    if (score.score < 70) {
      return {
        title: "Relancer un diagnostic",
        reason: "Quelques points sont à surveiller avant votre prochaine publication.",
        why: "Un projet en bonne santé se construit sans surprise.",
        action: { kind: "run-diagnostic", label: "Vérifier le projet", to: "/diagnostic" },
        etaMinutes: 1,
        priority: 3,
      };
    }

    const lastBuild = history.find((h) => h.projectId === project.id && h.kind !== "version");
    const lastVersion = history.find((h) => h.projectId === project.id && h.kind === "version");
    const hasVersionSinceBuild =
      lastVersion && (!lastBuild || lastVersion.createdAt > lastBuild.createdAt);

    if (hasVersionSinceBuild) {
      return {
        title: "Construisez la nouvelle version",
        reason: `La version ${project.currentVersion} n'a pas encore été construite.`,
        why: "Google Play accepte uniquement les fichiers .aab construits pour la bonne version.",
        action: { kind: "build-android", label: "Construire Android", to: "/build" },
        etaMinutes: 4,
        priority: 2,
      };
    }

    if (!lastVersion && !lastBuild) {
      return {
        title: "Préparez votre première publication",
        reason: "Choisissez comment faire évoluer votre application.",
        why: "Une version indique aux utilisateurs qu'une nouveauté est disponible.",
        action: { kind: "bump-version", label: "Modifier la version", to: "/version" },
        etaMinutes: 2,
        priority: 2,
      };
    }

    return {
      title: "Préparez la publication",
      reason: "Votre application semble prête à être publiée sur Google Play.",
      why: "L'assistant vérifie tout une dernière fois et met les notes en forme.",
      action: { kind: "prepare-publish", label: "Préparer la publication", to: "/publish" },
      etaMinutes: 3,
      priority: 2,
    };
  },

  /** Estimation du temps nécessaire pour la prochaine publication complète. */
  estimatePublishMinutes(checks: HealthCheck[]): number {
    const errors = checks.filter((c) => c.status === "error").length;
    const warnings = checks.filter((c) => c.status === "warning").length;
    // Base 6 min (version + build + notes) + pénalités douces.
    return 6 + errors * 4 + warnings * 1;
  },
};
