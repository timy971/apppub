import type { Project } from "@/core/types";
import { BuildService } from "@/core/build/service";
import type { OperationDef } from "./runner";
import type { StepStatus } from "./types";

/**
 * Catalogue humain des étapes du build Android.
 * Les identifiants « deps / web / sync / gradle / artifact » correspondent
 * à BuildService — on les préserve pour ne pas dupliquer la logique.
 */
export const ANDROID_BUILD_STEPS = [
  {
    id: "prepare",
    title: "Préparation du projet",
    description: "Vérification de l'environnement et des chemins.",
  },
  {
    id: "deps",
    title: "Vérification des dépendances",
    description: "Installation des paquets Node si nécessaire.",
  },
  {
    id: "web",
    title: "Compilation de l'application web",
    description: "Construction du bundle Vite / build de production.",
  },
  {
    id: "sync",
    title: "Synchronisation Capacitor",
    description: "Copie des ressources web vers le projet Android.",
  },
  {
    id: "gradle",
    title: "Compilation Android",
    description: "Gradle bundleRelease — l'étape la plus longue.",
  },
  {
    id: "artifact",
    title: "Récupération du fichier final",
    description: "Localisation, taille et validation du .aab produit.",
  },
] as const;

export interface AndroidBuildResult {
  aabPath?: string;
  aabSize?: number;
  durationMs: number;
  succeeded: boolean;
}

/**
 * Fabrique une OperationDef pour construire un projet Android.
 * Aucune duplication : on délègue à BuildService, on enrichit uniquement
 * la narration (étape « préparation », logs contextuels, streaming).
 */
export function createAndroidBuildOperation(project: Project): OperationDef {
  return {
    id: `android-build-${project.id}-${Date.now()}`,
    kind: "build",
    title: "Construction Android",
    steps: ANDROID_BUILD_STEPS.map((s) => ({ ...s })),
    async execute(ctrl) {
      const throwIfAborted = () => {
        if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
      };

      ctrl.setStep("prepare", "running", "Vérification du projet…");
      ctrl.log("info", `Projet : ${project.name}`, "prepare");
      ctrl.log("info", `Emplacement : ${project.localPath}`, "prepare");
      ctrl.log(
        "info",
        `Version ${project.currentVersion} · Build ${project.currentBuild}`,
        "prepare",
      );
      throwIfAborted();
      ctrl.setStep("prepare", "success", "Projet prêt.");

      const result = await BuildService.build(project, {
        signal: ctrl.signal,
        onStep: (id, status, detail) => {
          ctrl.setStep(id, status as StepStatus, detail);
        },
        onLine: (line) => {
          if (!line) return;
          ctrl.log("stdout", line);
        },
      });

      return result;
    },
  };
}
