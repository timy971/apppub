import { useSyncExternalStore } from "react";
import type { Project, Settings } from "@/core/types";
import { DEFAULT_SETTINGS, SettingsService } from "@/core/settings/service";
import { ProjectsService } from "@/core/projects/service";

/**
 * Store réactif minimal — évite d'introduire une dépendance externe.
 * Toute mise à jour passe par les services (source de vérité = localStorage).
 */
type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());

let cachedSettings: Settings = SettingsService.load();
let cachedProjects: Project[] = ProjectsService.list();
const serverSettings: Settings = DEFAULT_SETTINGS;
const serverProjects: Project[] = [];

export const AppStore = {
  getSettings: () => cachedSettings,
  getProjects: () => cachedProjects,
  getActiveProject: () =>
    cachedProjects.find((p) => p.id === cachedSettings.activeProjectId),

  /** Recharge explicitement l'état navigateur après l'hydratation SSR. */
  hydrate() {
    cachedSettings = SettingsService.load();
    cachedProjects = ProjectsService.list();
    emit();
  },

  updateSettings(patch: Partial<Settings>) {
    cachedSettings = SettingsService.update(patch);
    emit();
  },

  refreshProjects() {
    cachedProjects = ProjectsService.list();
    emit();
  },

  setActiveProject(id: string | undefined) {
    cachedSettings = SettingsService.update({ activeProjectId: id });
    emit();
  },

  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useSettings(): Settings {
  return useSyncExternalStore(
    AppStore.subscribe,
    AppStore.getSettings,
    () => serverSettings,
  );
}

export function useProjects(): Project[] {
  return useSyncExternalStore(
    AppStore.subscribe,
    AppStore.getProjects,
    () => serverProjects,
  );
}

export function useActiveProject(): Project | undefined {
  return useSyncExternalStore(
    AppStore.subscribe,
    AppStore.getActiveProject,
    () => undefined,
  );
}
