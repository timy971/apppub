import type { ProjectRule } from "../types";
import { getAndroidConfig } from "@/core/projects/android-config";

export const androidRules: ProjectRule[] = [
  {
    id: "android.folder",
    domain: "android",
    evaluate: ({ project }) =>
      project.detected.hasAndroid
        ? null
        : {
            severity: "warn",
            message: "Aucun dossier Android n'a été trouvé dans le projet.",
            hint: "Exécutez « npx cap add android » avant de préparer un build.",
          },
  },
  {
    id: "android.gradle",
    domain: "android",
    evaluate: ({ project }) => {
      if (!project.detected.hasAndroid) return null;
      return project.detected.hasGradleWrapper
        ? null
        : {
            severity: "error",
            message: "Le wrapper Gradle est absent du projet Android.",
            hint: "Réinstallez la plateforme Android depuis Capacitor.",
          };
    },
  },
  {
    id: "android.applicationId",
    domain: "android",
    evaluate: ({ project }) => {
      if (!project.detected.hasAndroid) return null;
      const cfg = getAndroidConfig(project);
      return cfg.applicationId && cfg.applicationId.trim().length > 0
        ? null
        : {
            severity: "warn",
            message: "L'identifiant d'application Android n'est pas renseigné.",
            hint: "Renseignez-le dans l'onglet Publication.",
          };
    },
  },
  {
    id: "android.keystore",
    domain: "android",
    evaluate: ({ project }) => {
      if (!project.detected.hasAndroid) return null;
      const cfg = getAndroidConfig(project);
      return cfg.keystorePath && cfg.keystorePath.trim().length > 0
        ? null
        : {
            severity: "warn",
            message: "Aucune clé de signature n'est configurée.",
            hint: "Requise pour publier sur Google Play.",
          };
    },
  },
];
