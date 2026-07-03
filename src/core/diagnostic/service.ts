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

    const [existsAndroid, existsVersionJson, existsVersionScript] = await Promise.all([
      projectPath ? b.fs.exists(`${projectPath}/android`) : Promise.resolve(!!has?.hasAndroid),
      projectPath ? b.fs.exists(`${projectPath}/version.json`) : Promise.resolve(!!has?.hasVersionJson),
      projectPath
        ? b.fs.exists(`${projectPath}/scripts/version.mjs`)
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
        present: !project ? false : !!existsAndroid,
        okMsg: "Le projet Android est présent.",
        koMsg: project
          ? "Le dossier Android n'a pas encore été préparé pour ce projet."
          : "Aucun projet sélectionné.",
        why: "Le dossier android/ contient la version mobile de votre application.",
        category: "project",
        weight: 3,
      }),
      okOrWarning({
        id: "version-json",
        label: "Fichier de version",
        present: !project ? false : !!existsVersionJson,
        okMsg: "Le fichier de version est présent.",
        koMsg: "Le fichier de version est manquant.",
        why: "Ce fichier permet à AppPublisher de connaître et faire évoluer la version.",
        category: "project",
        weight: 2,
      }),
      okOrWarning({
        id: "version-script",
        label: "Script de mise à jour de version",
        present: !project ? false : !!existsVersionScript,
        okMsg: "Le script officiel de version est présent.",
        koMsg: "Le script scripts/version.mjs est manquant.",
        why: "AppPublisher utilise ce script pour appliquer la nouvelle version sans risque.",
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
