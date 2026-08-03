import type { Project } from "@/core/types";
import type { AndroidPreparationRequest } from "@/core/bridge/types";
import { CapacitorService, type PrepareAndroidOutcome } from "@/core/capacitor/service";
import type { OperationDef } from "./runner";
import type { StepStatus } from "./types";

/**
 * Opération longue « Créer le projet Android » — réutilise l'infrastructure
 * générique OperationRunner : mêmes logs, mêmes étapes, même annulation
 * que le build. Aucun moteur d'exécution parallèle.
 */
export const ANDROID_CREATE_STEPS = [
  {
    id: "analyze",
    title: "Analyse finale",
    description: "Compatibilité, gestionnaire de paquets et configuration existante.",
  },
  {
    id: "dependencies",
    title: "Dépendances",
    description: "Installation du projet et des composants Capacitor nécessaires.",
  },
  {
    id: "configure",
    title: "Configuration Capacitor",
    description: "Création atomique de capacitor.config.json si nécessaire.",
  },
  {
    id: "web",
    title: "Build web",
    description: "Compilation de l’application web et contrôle du fichier index.html.",
  },
  { id: "add", title: "Création Android", description: "Exécution de `npx cap add android`." },
  { id: "sync", title: "Synchronisation", description: "Copie initiale des ressources web." },
  {
    id: "verify",
    title: "Compilation de contrôle",
    description: "Construction d’un APK de test pour valider Gradle et le SDK.",
  },
] as const;

export interface AndroidCreateResult {
  outcome: PrepareAndroidOutcome;
  durationMs: number;
  applicationId: string;
}

export function createAndroidCreateOperation(
  project: Project,
  request: AndroidPreparationRequest,
): OperationDef {
  return {
    id: `android-create-${project.id}-${Date.now()}`,
    kind: "generic",
    title: "Création du projet Android",
    steps: ANDROID_CREATE_STEPS.map((s) => ({ ...s })),
    async execute(ctrl) {
      ctrl.log("info", `Projet : ${project.name}`, "analyze");
      ctrl.log("info", `Identifiant Android : ${request.applicationId}`, "analyze");
      ctrl.log("info", `Sortie web : ${request.webDir}/`, "analyze");
      const result = await CapacitorService.prepareAndroid(project, request, {
        signal: ctrl.signal,
        onStep: (id, status, detail) => ctrl.setStep(id, status as StepStatus, detail),
        onLine: (line) => {
          if (line) ctrl.log("stdout", line);
        },
      });
      if (result.outcome.kind === "failed") {
        throw new Error(result.outcome.message || "La création du projet Android a échoué.");
      }
      return result;
    },
  };
}
