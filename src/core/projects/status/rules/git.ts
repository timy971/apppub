import type { ProjectRule } from "../types";

export const gitRules: ProjectRule[] = [
  {
    id: "git.repo",
    domain: "git",
    evaluate: ({ project }) =>
      project.githubRepo && project.githubRepo.trim().length > 0
        ? null
        : {
            severity: "info",
            message: "Aucun dépôt Git n'est associé.",
            explanation:
              "Renseigner un dépôt facilite la sauvegarde, les publications répétées et le partage.",
            action: {
              label: "Ajouter le dépôt Git",
              tab: "identity",
              section: "identity",
              field: "githubRepo",
            },
          },
  },
];
