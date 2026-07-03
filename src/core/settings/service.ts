import type { Settings } from "@/core/types";
import { storage, STORAGE_KEYS } from "@/core/storage";

export const DEFAULT_SETTINGS: Settings = {
  userName: "",
  theme: "system",
  mode: "discovery",
  language: "fr",
  onboardingCompleted: false,
  contextualHelpEnabled: true,
  autoBackupEnabled: true,
};

export const SettingsService = {
  load(): Settings {
    return { ...DEFAULT_SETTINGS, ...storage.get(STORAGE_KEYS.settings, {} as Partial<Settings>) };
  },
  save(next: Settings): void {
    storage.set(STORAGE_KEYS.settings, next);
  },
  update(patch: Partial<Settings>): Settings {
    const next = { ...this.load(), ...patch };
    this.save(next);
    return next;
  },
  reset(): Settings {
    this.save(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  },
};
