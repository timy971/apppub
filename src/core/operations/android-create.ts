import type { Project } from "@/core/types";
import { CapacitorService, type AddAndroidOutcome } from "@/core/capacitor/service";
import type { OperationDef } from "./runner";
import type { StepStatus } from "./types";

/**
 * Opération longue « Créer le projet Android » — réutilise l'infrastructure
 * générique OperationRunner : mêmes logs, mêmes étapes, même annulation
 * que le build. Aucun moteur d'exécution parallèle.
 */
export const ANDROID_CREATE_STEPS = [
  { id: "prepare", title: "Vérification", description: "État du projet et présence du dossier android/." },
  { id: "capacitor", title: "Installation Capacitor", description: "Ajout de @capacitor/cli et @capacitor/android si nécessaire." },
  { id: "add", title: "Création Android", description: "Exécution de `npx cap add android`." },
  { id: "sync", title: "Synchronisation", description: "Copie initiale des ressources web." },
] as const;

export interface AndroidCreateResult {
  outcome: AddAndroidOutcome;
  durationMs: number;
}

export function createAndroidCreateOperation(project: Project): OperationDef {
  return {
    id: `android-create-${project.id}-${Date.now()}`,
    kind: "generic",
    title: "Création du projet Android",
    steps: ANDROID_CREATE_STEPS.map((s) => ({ ...s })),
    async execute(ctrl) {
      ctrl.log("info", `Projet : ${project.name}`, "prepare");
      ctrl.log("info", `Emplacement : ${project.localPath}`, "prepare");
      const result = await CapacitorService.addAndroid(project, {
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
