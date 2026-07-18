import type { ProjectRule } from "../types";

export const versionRules: ProjectRule[] = [
  {
    id: "version.readable",
    domain: "version",
    evaluate: ({ project }) =>
      /^\d+\.\d+\.\d+/.test(project.currentVersion)
        ? null
        : {
            severity: "warn",
            message: "Le numéro de version n'est pas au format attendu.",
            hint: "Un format « 1.2.3 » facilite le suivi des publications.",
          },
  },
  {
    id: "version.script",
    domain: "version",
    evaluate: ({ project }) =>
      project.detected.hasVersionJson || project.detected.hasVersionScript
        ? null
        : {
            severity: "info",
            message: "Aucun fichier version.json n'a été trouvé.",
            hint: "AppPublisher pourra le créer lors de la première mise à jour de version.",
          },
  },
];
