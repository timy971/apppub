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
            explanation:
              "Un dossier android/ est nécessaire pour compiler l'application sous Android.",
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
            explanation:
              "Sans le wrapper Gradle, aucune commande de build Android ne peut être exécutée.",
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
            explanation:
              "L'applicationId identifie de façon unique votre app sur Google Play (ex : com.entreprise.monapp).",
            action: {
              label: "Renseigner l'identifiant",
              tab: "publishing",
              section: "android",
              field: "android.applicationId",
            },
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
            explanation:
              "Le keystore signe cryptographiquement votre APK/AAB. Sans lui, Google Play refuse la publication.",
            action: {
              label: "Configurer le keystore",
              tab: "publishing",
              section: "android",
              field: "android.keystorePath",
            },
          };
    },
  },
];
