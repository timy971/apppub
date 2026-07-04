/**
 * SystemBridge — contrat unique entre le renderer et le monde extérieur.
 * Web (preview Lovable) : implémenté par un adapter simulé.
 * Electron (binaire distribué) : implémenté par le preload qui expose
 * `window.appPublisher` via `contextBridge`.
 */
import type {
  DetectedFiles,
  ExecLineHandler,
  ExecOptions,
  ExecResult,
  ScannedProject,
  SystemInfo,
} from "@/core/types";

export interface SystemBridge {
  readonly runtime: "electron" | "web";

  system: {
    detect(): Promise<SystemInfo>;
  };

  projects: {
    detect(path: string): Promise<DetectedFiles | null>;
    scan(rootPath: string): Promise<ScannedProject[]>;
    chooseFolder(): Promise<string | null>;
    /**
     * Phase 3 — ré-enregistre en une passe les racines des projets connus.
     * Appelé au démarrage : sans ça, le confinement fs:* rejette toute
     * lecture sur un projet sauvegardé au 2ᵉ lancement.
     * Retourne la liste des racines effectivement acceptées.
     */
    registerRoots(paths: string[]): Promise<string[]>;
  };

  exec: {
    run(opts: ExecOptions, onLine?: ExecLineHandler): Promise<ExecResult>;
  };

  fs: {
    exists(path: string): Promise<boolean>;
    readJson<T = unknown>(path: string): Promise<T | null>;
    readText(path: string): Promise<string | null>;
    stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
    listDir(path: string): Promise<string[]>;
    findByExtension(dir: string, ext: string, maxDepth?: number): Promise<string[]>;
    /** Phase 3 — écritures confinées aux racines projet. */
    mkdir(path: string): Promise<boolean>;
    writeText(path: string, content: string): Promise<boolean>;
    writeJson(path: string, value: unknown): Promise<boolean>;
    copyFile(src: string, dest: string): Promise<boolean>;
  };

  shell: {
    openFolder(path: string): Promise<void>;
    revealItem(path: string): Promise<void>;
  };

  net: {
    online(): Promise<boolean>;
  };
}
