/**
 * Persistance AppPublisher.
 *
 * - Electron : fichier JSON versionné dans `userData`, écrit atomiquement
 *   par le processus principal et sauvegardé avant chaque remplacement.
 * - Web/Lovable : localStorage, avec erreurs remontées au lieu d'être avalées.
 *
 * L'interface reste synchrone afin de ne pas rendre asynchrones tous les
 * services métier existants. Les documents sont petits et l'IPC synchrone
 * n'est utilisé que pour ces lectures/écritures locales bornées.
 */

export interface StorageStatus {
  ok: boolean;
  runtime: "electron" | "web";
  schemaVersion?: number;
  filePath?: string;
  lastError?: string | null;
}

export interface StorageAdapter {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  status(): StorageStatus;
}

interface NativeStorageApi {
  get(key: string): { ok: boolean; found?: boolean; value?: unknown; error?: string };
  set(key: string, value: unknown): { ok: boolean; error?: string };
  remove(key: string): { ok: boolean; error?: string };
  status(): {
    ok: boolean;
    schemaVersion?: number;
    filePath?: string;
    lastError?: string | null;
    error?: string;
  };
  exportFile(): Promise<string | null>;
  importFile(): Promise<{ path: string; keys: string[] } | null>;
}

const PREFIX = "apppublisher.v1.";

function nativeStorage(): NativeStorageApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window as unknown as {
      appPublisher?: { runtime?: string; storage?: NativeStorageApi };
    }
  ).appPublisher?.storage;
}

function errorMessage(action: string, error?: string): string {
  return `Impossible de ${action} les données AppPublisher${error ? ` : ${error}` : "."}`;
}

class PersistentDesktopAdapter implements StorageAdapter {
  private migrationError: string | null = null;

  private api(): NativeStorageApi {
    const api = nativeStorage();
    if (!api) throw new Error("Stockage Electron indisponible.");
    return api;
  }

  private quarantineLegacy(legacyKey: string, raw: string): void {
    try {
      window.localStorage.setItem(`${legacyKey}.corrupt-${Date.now()}`, raw);
      window.localStorage.removeItem(legacyKey);
    } catch {
      // Le signalement reste conservé en mémoire même si la quarantaine échoue.
    }
  }

  get<T>(key: string, fallback: T): T {
    const result = this.api().get(key);
    if (!result.ok) throw new Error(errorMessage("lire", result.error));
    if (result.found) return result.value as T;

    // Migration unique depuis l'ancien localStorage Chromium.
    if (typeof window !== "undefined") {
      const legacyKey = PREFIX + key;
      let raw: string | null;
      try {
        raw = window.localStorage.getItem(legacyKey);
      } catch (error) {
        this.migrationError = errorMessage(
          "lire",
          `stockage historique inaccessible (${String(error)})`,
        );
        return fallback;
      }
      if (raw != null) {
        let parsed: T;
        try {
          parsed = JSON.parse(raw) as T;
        } catch (error) {
          this.migrationError = errorMessage(
            "migrer",
            `JSON local corrompu pour « ${key} » (${String(error)})`,
          );
          this.quarantineLegacy(legacyKey, raw);
          return fallback;
        }
        const migrated = this.api().set(key, parsed);
        if (!migrated.ok) {
          this.migrationError = errorMessage("migrer", migrated.error);
          this.quarantineLegacy(legacyKey, raw);
          return fallback;
        }
        try {
          window.localStorage.removeItem(legacyKey);
        } catch (error) {
          this.migrationError = errorMessage(
            "finaliser la migration de",
            `ancien stockage impossible à supprimer (${String(error)})`,
          );
        }
        return parsed;
      }
    }
    return fallback;
  }

  set<T>(key: string, value: T): void {
    const result = this.api().set(key, value);
    if (!result.ok) throw new Error(errorMessage("enregistrer", result.error));
  }

  remove(key: string): void {
    const result = this.api().remove(key);
    if (!result.ok) throw new Error(errorMessage("supprimer", result.error));
  }

  status(): StorageStatus {
    const result = this.api().status();
    return {
      ok: result.ok && !this.migrationError,
      runtime: "electron",
      schemaVersion: result.schemaVersion,
      filePath: result.filePath,
      lastError: this.migrationError ?? result.lastError ?? result.error ?? null,
    };
  }
}

class LocalStorageAdapter implements StorageAdapter {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      throw new Error(errorMessage("lire", `JSON local corrompu (${String(error)})`));
    }
  }

  set<T>(key: string, value: T): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (error) {
      throw new Error(errorMessage("enregistrer", String(error)));
    }
  }

  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch (error) {
      throw new Error(errorMessage("supprimer", String(error)));
    }
  }

  status(): StorageStatus {
    return { ok: true, runtime: "web" };
  }
}

export const storage: StorageAdapter = nativeStorage()
  ? new PersistentDesktopAdapter()
  : new LocalStorageAdapter();

export async function exportDesktopData(): Promise<string | null> {
  const api = nativeStorage();
  if (!api) throw new Error("L'export est disponible uniquement dans l'application Desktop.");
  return api.exportFile();
}

export async function importDesktopData(): Promise<{ path: string; keys: string[] } | null> {
  const api = nativeStorage();
  if (!api) throw new Error("L'import est disponible uniquement dans l'application Desktop.");
  return api.importFile();
}

export const STORAGE_KEYS = {
  settings: "settings",
  projects: "projects",
  history: "history",
  journal: "journal",
} as const;
