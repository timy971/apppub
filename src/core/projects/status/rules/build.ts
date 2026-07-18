import type { ProjectRule } from "../types";

export const buildRules: ProjectRule[] = [
  {
    id: "build.capacitor",
    domain: "build",
    evaluate: ({ project }) => {
      if (!project.detected.hasAndroid && !project.detected.hasIos) return null;
      return project.detected.hasCapacitorConfig
        ? null
        : {
            severity: "warn",
            message: "Aucune configuration Capacitor détectée.",
            hint: "Un fichier capacitor.config.* est attendu à la racine.",
          };
    },
  },
];
