import type {
  Checklist,
  ChecklistItem,
  HealthCheck,
  Project,
  PublishRecord,
} from "@/core/types";

/**
 * ChecklistService — checklists intelligentes.
 * Chaque item est calculé automatiquement à partir de l'état réel du projet.
 * L'utilisateur ne coche jamais rien manuellement.
 */
export const ChecklistService = {
  publish(input: {
    project: Project | undefined;
    checks: HealthCheck[];
    history: PublishRecord[];
    notes?: string;
  }): Checklist {
    const { project, checks, history, notes } = input;
    const items: ChecklistItem[] = [];

    items.push({
      id: "project",
      label: "Un projet est sélectionné",
      status: project ? "ok" : "error",
      detail: project ? project.name : "Sélectionnez un projet.",
      fix: project ? undefined : { label: "Choisir un projet", to: "/projects" },
    });

    const envErrors = checks.filter(
      (c) => c.category === "environment" && c.status === "error",
    );
    items.push({
      id: "environment",
      label: "Environnement de développement prêt",
      status: envErrors.length ? "error" : "ok",
      detail: envErrors.length
        ? envErrors[0].detail || "Un outil est manquant."
        : "Tous les outils requis sont disponibles.",
      fix: envErrors.length ? { label: "Voir le diagnostic", to: "/diagnostic" } : undefined,
    });

    items.push({
      id: "version",
      label: "Numéro de version défini",
      status: project ? "ok" : "warning",
      detail: project ? `Version ${project.currentVersion} · Build ${project.currentBuild}` : "—",
    });

    const lastBuild = history.find(
      (h) => project && h.projectId === project.id && h.kind !== "version" && h.outcome === "success",
    );
    const buildFresh =
      !!lastBuild &&
      !!project &&
      lastBuild.version === project.currentVersion &&
      lastBuild.build === project.currentBuild;

    items.push({
      id: "artifact",
      label: "Fichier d'application construit",
      status: buildFresh ? "ok" : "warning",
      detail: buildFresh
        ? "Un fichier .aab est disponible pour cette version."
        : "Aucun fichier .aab n'a encore été construit pour cette version.",
      fix: buildFresh ? undefined : { label: "Construire", to: "/build" },
    });

    items.push({
      id: "notes",
      label: "Notes de version rédigées",
      status: notes && notes.trim().length > 0 ? "ok" : "warning",
      detail: notes && notes.trim().length > 0
        ? "Les notes sont prêtes à être copiées."
        : "Rédigez quelques lignes sur les nouveautés.",
    });

    items.push({
      id: "signing",
      label: "Clé de signature configurée",
      status: project?.keystorePath ? "ok" : "warning",
      detail: project?.keystorePath
        ? "La clé de signature est configurée."
        : "À configurer avant l'envoi sur Google Play.",
    });

    const readyToPublish = items.every((i) => i.status === "ok");

    return {
      id: "publish",
      title: "Vérifications avant publication",
      items,
      readyToPublish,
    };
  },
};
