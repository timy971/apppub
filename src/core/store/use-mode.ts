import { useSettings } from "@/core/store/app-store";
import type { ExperienceMode } from "@/core/types";

/**
 * Hooks fins autour du mode d'utilisation.
 * Le mode est déjà persisté par SettingsService — ces hooks sont juste
 * du sucre syntaxique pour rendre les composants plus lisibles.
 */
export function useMode(): ExperienceMode {
  return useSettings().mode;
}

export function useIsDiscovery(): boolean {
  return useMode() === "discovery";
}

export function useIsAssistant(): boolean {
  return useMode() === "assistant";
}

export function useIsExpert(): boolean {
  return useMode() === "expert";
}
