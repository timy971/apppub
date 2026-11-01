import type { HealthCheck, Project } from "@/core/types";
import { bridge } from "@/core/bridge";

/**
 * Diagnostic — passe par le bridge. Réel en Electron, simulé en Web.
 * Chaque check produit une phrase française (aucun jargon), et un `why?`
 * pédagogique pour le bouton « Pourquoi ? ».
 */
export const DiagnosticService = {
  async run(project: Project | undefined): Promise<HealthCheck[]> {
    const b = bridge();
    const info = await b.system.detect();

    const projectPath = project?.localPath;
    const has = project?.detected;
    const managedPublicationProject =
      (project?.source?.type === "git" && project.source.managed === true) ||
      Boolean(projectPath?.includes("/Application Support/AppPublisher/managed-projects/"));
    const disposableAndroid =
      Boolean(project) &&
      managedPublicationProject &&
      has?.androidReadiness !== "blocked";
    const versionManagedByAppPublisher =
      Boolean(project?.currentVersion) && managedPublicationProject;

    const [existsAndroid, existsVersionJson, existsVersionScript] = await Promise.all([
      projectPath ? b.fs.exists(`${projectPath}/android`) : Promise.resolve(!!has?.hasAndroid),
      projectPath ? b.fs.exists(`${projectPath}/version.json`) : Promise.resolve(!!has?.hasVersionJson),
      projectPath
        ? Promise.all([
            b.fs.exists(`${projectPath}/scripts/version.mjs`),
            b.fs.exists(`${projectPath}/scripts/version.js`),
          ]).then(([mjs, js]) => mjs || js)
        : Promise.resolve(!!has?.hasVersionScript),
    ]);

    return [
      okOrError({
        id: "node",
        label: "Node.js",
        present: !!info.node,
        okMsg: "Node.js est correctement installé.",
        koMsg: "Node.js est introuvable sur votre ordinateur.",
        why: "Node.js permet à AppPublisher d'exécuter les scripts de votre projet.",
        category: "environment",
        weight: 3,
      }),
      okOrError({
        id: "npm",
        label: "Gestionnaire de paquets",
        present: !!info.npm,
        okMsg: "Le gestionnaire de paquets est prêt.",
        koMsg: "Le gestionnaire de paquets n'est pas disponible.",
        why: "Il installe les dépendances nécessaires pour préparer votre application.",
        category: "environment",
        weight: 2,
      }),
      okOrWarning({
        id: "git",
        label: "Sauvegarde de code (Git)",
        present: !!info.git,
        okMsg: "L'outil de sauvegarde est prêt.",
        koMsg: "L'outil de sauvegarde n'a pas été trouvé (facultatif pour l'instant).",
        why: "Git permettra de sauvegarder votre projet en ligne en Phase 3.",
        category: "environment",
        weight: 1,
      }),
      okOrError({
        id: "java",
        label: "Java",
        present: !!info.java,
        okMsg: "Java est installé.",
        koMsg: "Java n'est pas installé.",
        why: "Java est indispensable pour fabriquer le fichier Android.",
        category: "environment",
        weight: 3,
      }),
      okOrError({
        id: "sdk",
        label: "SDK Android",
        present: !!info.androidSdk || !!info.androidHome,
        okMsg: `Le SDK Android est prêt${info.androidSdk ? ` (API ${info.androidSdk})` : ""}.`,
        koMsg: "Le SDK Android n'a pas été détecté.",
        why: "Le SDK Android contient les outils utilisés pour compiler votre application.",
        category: "environment",
        weight: 3,
      }),
      okOrWarning({
        id: "android-studio",
        label: "Android Studio",
        present: !!info.androidStudio,
        okMsg: "Android Studio est installé.",
        koMsg: "Android Studio n'a pas été détecté (recommandé la première fois).",
        why: "Android Studio installe automatiquement le SDK Android.",
        category: "environment",
        weight: 2,
      }),
      okOrError({
        id: "project-android",
        label: "Dossier Android du projet",
        present: !project ? false : !!existsAndroid || disposableAndroid,
        okMsg: existsAndroid
          ? "Le projet Android est présent."
          : disposableAndroid
            ? "Android sera préparé automatiquement dans une copie de publication propre."
            : "Le projet Android est prêt.",
        koMsg: project
          ? has?.androidReadiness === "blocked"
            ? has.androidReadinessReason ||
              "Le projet doit être corrigé avant de pouvoir préparer Android."
            : "Le dossier Android n'a pas encore été préparé pour ce projet."
          : "Aucun projet sélectionné.",
        why: disposableAndroid
          ? "AppPublisher peut créer Android au moment de la publication sans modifier votre projet source."
          : "Le dossier android/ contient la version mobile de votre application.",
        category: "project",
        weight: 3,
      }),
      okOrWarning({
        id: "version-json",
        label: "Fichier de version",
        present: !project ? false : !!existsVersionJson || versionManagedByAppPublisher,
        okMsg: existsVersionJson
          ? "Le fichier de version est présent."
          : versionManagedByAppPublisher
            ? "La version est gérée directement par AppPublisher pour la publication."
            : "La version est disponible.",
        koMsg: "Le fichier de version est manquant.",
        why: versionManagedByAppPublisher
          ? "Pour un projet Git géré, AppPublisher conserve l'intention de version et la réapplique dans la copie de publication."
          : "Ce fichier permet à AppPublisher de connaître et faire évoluer la version.",
        category: "project",
        weight: 2,
      }),
      okOrWarning({
        id: "version-script",
        label: "Script de mise à jour de version",
        present: !project ? false : !!existsVersionScript || versionManagedByAppPublisher,
        okMsg: existsVersionScript
          ? "Le script officiel de version est présent."
          : versionManagedByAppPublisher
            ? "Aucun script n'est requis : AppPublisher applique la version dans la copie de publication."
            : "La mise à jour de version est prête.",
        koMsg: "Le script scripts/version.mjs ou scripts/version.js est manquant.",
        why: versionManagedByAppPublisher
          ? "Le workspace jetable du Lot 12 permet de préparer la version sans modifier la source Git."
          : "AppPublisher utilise ce script pour appliquer la nouvelle version sans risque.",
        category: "project",
        weight: 2,
      }),
      okOrWarning({
        id: "internet",
        label: "Connexion Internet",
        present: info.internet,
        okMsg: "Vous êtes connecté à Internet.",
        koMsg: "Aucune connexion Internet détectée.",
        why: "La connexion sera nécessaire pour installer des dépendances ou publier.",
        category: "network",
        weight: 1,
      }),
    ];
  },
};

function okOrError(x: {
  id: string;
  label: string;
  present: boolean;
  okMsg: string;
  koMsg: string;
  why: string;
  category: HealthCheck["category"];
  weight: number;
}): HealthCheck {
  return {
    id: x.id,
    label: x.label,
    status: x.present ? "ok" : "error",
    detail: x.present ? x.okMsg : x.koMsg,
    why: x.why,
    category: x.category,
    weight: x.weight,
  };
}

function okOrWarning(x: {
  id: string;
  label: string;
  present: boolean;
  okMsg: string;
  koMsg: string;
  why: string;
  category: HealthCheck["category"];
  weight: number;
}): HealthCheck {
  return {
    id: x.id,
    label: x.label,
    status: x.present ? "ok" : "warning",
    detail: x.present ? x.okMsg : x.koMsg,
    why: x.why,
    category: x.category,
    weight: x.weight,
  };
}
