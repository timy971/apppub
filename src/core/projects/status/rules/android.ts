import type { ProjectRule } from "../types";
import { getAndroidConfig } from "@/core/projects/android-config";

function isManagedGit(project: Parameters<ProjectRule["evaluate"]>[0]["project"]) {
  return project.source?.type === "git" && project.source.managed === true;
}

function isDisposableAndroidRebuild(project: Parameters<ProjectRule["evaluate"]>[0]["project"]) {
  return (
    isManagedGit(project) &&
    project.detected.hasAndroid &&
    project.detected.androidReadiness === "blocked" &&
    !project.detected.hasGradleWrapper &&
    /android\/.*incomplet|wrapper Gradle|build\.gradle/i.test(
      project.detected.androidReadinessReason || "",
    )
  );
}

export const androidRules: ProjectRule[] = [
  {
    id: "android.folder",
    domain: "android",
    evaluate: ({ project }) => {
      if (project.detected.androidReadiness === "blocked") {
        if (isDisposableAndroidRebuild(project)) {
          return {
            severity: "info",
            message: "Android sera reconstruit automatiquement lors de la publication.",
            explanation:
              "La copie Android actuelle est incomplète, mais AppPublisher la recréera uniquement dans un workspace temporaire sans modifier le projet source.",
            hint: "Vous pouvez continuer vers la création du fichier Android.",
          };
        }
        return {
          severity: "error",
          message: "Ce projet web ne peut pas encore être préparé automatiquement pour Android.",
          explanation:
            project.detected.androidReadinessReason ||
            "Le build web ou la configuration Capacitor doit être corrigé.",
          hint: "Ouvrez le Build Center pour consulter l’analyse détaillée.",
        };
      }
      if (project.detected.hasAndroid) return null;
      return {
        severity: "warn",
        message: "Ce projet est prêt à être préparé pour Android.",
        explanation:
          "AppPublisher peut configurer Capacitor, créer android/ et effectuer une compilation de contrôle.",
        hint: "Ouvrez le Build Center puis choisissez « Préparer Android ».",
      };
    },
  },
  {
    id: "android.gradle",
    domain: "android",
    evaluate: ({ project }) => {
      if (!project.detected.hasAndroid || isDisposableAndroidRebuild(project)) return null;
      return project.detected.hasGradleWrapper
        ? null
        : {
            severity: "warn",
            message: "Le wrapper Gradle est absent du projet Android.",
            explanation:
              "AppPublisher peut utiliser une installation globale de Gradle, mais le wrapper local reste plus fiable et reproductible.",
            hint: "Le préflight vérifiera automatiquement si Gradle est disponible globalement.",
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
      return cfg.signingProfileId || (cfg.keystorePath && cfg.keystorePath.trim().length > 0)
        ? null
        : {
            severity: "warn",
            message: "Aucune signature n'est associée à l'application.",
            explanation:
              "La signature prouve à Google Play que les futures versions viennent bien de vous.",
            action: {
              label: "Choisir une signature",
              tab: "publishing",
              section: "android",
              field: "android.signingProfileId",
            },
          };
    },
  },
];
