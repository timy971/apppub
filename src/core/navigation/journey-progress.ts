import { AppStore } from "@/core/store/app-store";
import type { PublicationJourneyPath } from "@/core/types";

export const JOURNEY_LABELS: Record<PublicationJourneyPath, string> = {
  "/projects": "Votre application",
  "/diagnostic": "Vérifier",
  "/version": "Préparer la version",
  "/signing": "Protéger",
  "/build": "Créer le fichier",
  "/publish": "Publier",
};

export function isJourneyPath(value: string): value is PublicationJourneyPath {
  return value in JOURNEY_LABELS;
}

export const JourneyProgress = {
  visit(path: PublicationJourneyPath): void {
    if (AppStore.getSettings().lastJourneyPath === path) return;
    AppStore.updateSettings({ lastJourneyPath: path });
  },

  rememberReturnTo(path: PublicationJourneyPath): void {
    if (AppStore.getSettings().returnToJourneyPath === path) return;
    AppStore.updateSettings({ returnToJourneyPath: path });
  },

  clearReturnTo(): void {
    if (!AppStore.getSettings().returnToJourneyPath) return;
    AppStore.updateSettings({ returnToJourneyPath: undefined });
  },
};
