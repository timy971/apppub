/**
 * SystemBridge — contrat unique entre le renderer et le monde extérieur.
 * Web (preview Lovable) : implémenté par un adapter simulé.
 * Electron (binaire distribué) : implémenté par le preload qui expose
 * `window.appPublisher` via `contextBridge`.
 *
 * Tous les services (`projects`, `diagnostic`, `version`, `build`, `journal`)
 * n'importent QUE ce module. Aucun composant UI ne connaît le runtime.
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
    /** Détecte Node, npm, Git, Java, Android SDK, Android Studio, Internet. */
    detect(): Promise<SystemInfo>;
  };

  projects: {
    /** Lit les fichiers marqueurs d'un dossier projet. */
    detect(path: string): Promise<DetectedFiles>;
    /** Scanne récursivement un dossier racine (niveau 1) et retourne les projets détectés. */
    scan(rootPath: string): Promise<ScannedProject[]>;
    /** Ouvre le sélecteur de dossier natif. Retourne le chemin choisi ou null. */
    chooseFolder(): Promise<string | null>;
  };

  exec: {
    /** Exécute une commande en streaming. Chaque ligne stdout/stderr → onLine. */
    run(opts: ExecOptions, onLine?: ExecLineHandler): Promise<ExecResult>;
  };

  fs: {
    exists(path: string): Promise<boolean>;
    readJson<T = unknown>(path: string): Promise<T | null>;
    readText(path: string): Promise<string | null>;
    stat(path: string): Promise<{ size: number; isFile: boolean; isDir: boolean } | null>;
    /** Renvoie les fichiers du dossier (non récursif). */
    listDir(path: string): Promise<string[]>;
    /** Recherche récursive limitée d'un fichier par extension (ex: .aab). */
    findByExtension(dir: string, ext: string, maxDepth?: number): Promise<string[]>;
  };

  shell: {
    /** Ouvre le dossier dans le Finder / Explorer. */
    openFolder(path: string): Promise<void>;
    /** Sélectionne le fichier dans le Finder / Explorer. */
    revealItem(path: string): Promise<void>;
  };

  net: {
    /** Ping léger, sans révélation de la cible utilisateur. */
    online(): Promise<boolean>;
  };
}
