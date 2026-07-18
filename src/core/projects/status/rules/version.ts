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
            explanation:
              "Un format « 1.2.3 » (semver) est requis par Google Play et facilite le suivi.",
            action: {
              label: "Corriger la version",
              tab: "configuration",
              section: "version",
              field: "currentVersion",
            },
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
            explanation:
              "AppPublisher pourra le créer lors de la première mise à jour de version.",
          },
  },
];
