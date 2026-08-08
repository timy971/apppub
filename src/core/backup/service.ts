import type { Project, ProjectBackup, UUID } from "@/core/types";
import { storage } from "@/core/storage";
import { JournalService } from "@/core/journal/logger";
import { bridge } from "@/core/bridge";
import { CopilotBus } from "@/core/copilot/bus";

/**
 * BackupService — sauvegarde légère avant une opération sensible.
 *
 * Phase 3 : sous Electron, on écrit un vrai snapshot sur disque dans
 * `<projet>/.apppublisher-backups/<timestamp>/`. Les fichiers critiques
 * (version, métadonnées et configuration Gradle modifiée par AppPublisher)
 * sont copiés à l'identique. `restore()` permet de remettre le projet dans
 * cet état.
 *
 * Sous Web (preview Lovable), on garde uniquement une trace mémoire
 * (métadonnées + contenu texte) pour continuer à faire fonctionner l'UI.
 */

const KEY = "backups";

interface StoredBackup extends ProjectBackup {
  contents?: Record<string, string>;
}

const SNAPSHOT_FILES = [
  "version.json",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "capacitor.config.json",
  "capacitor.config.ts",
  "capacitor.config.js",
  "CHANGELOG.md",
  "android/app/build.gradle",
  "android/app/build.gradle.kts",
  "android/variables.gradle",
];

function uid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const BackupService = {
  list(projectId: UUID): ProjectBackup[] {
    return storage.get<StoredBackup[]>(KEY, []).filter((b) => b.projectId === projectId);
  },

  async create(project: Project, reason: ProjectBackup["reason"]): Promise<ProjectBackup> {
    const b = bridge();
    const files: ProjectBackup["files"] = [];
    const contents: Record<string, string> = {};
    let location: string | undefined;

    if (b.runtime === "electron") {
      const snapshot = await b.backups.create(project.localPath, reason);
      location = snapshot.location;
      files.push(...snapshot.files);
    } else {
      for (const rel of SNAPSHOT_FILES) {
        const p = `${project.localPath}/${rel}`;
        const stat = await b.fs.stat(p);
        if (!stat?.isFile) continue;
        files.push({ path: rel, size: stat.size });
        const text = await b.fs.readText(p);
        if (text != null) contents[rel] = text;
      }
    }

    const backup: StoredBackup = {
      id: uid(),
      projectId: project.id,
      reason,
      createdAt: new Date().toISOString(),
      files,
      contents: b.runtime === "web" ? contents : undefined,
      location,
    };
    const all = storage.get<StoredBackup[]>(KEY, []);
    // On garde les 20 derniers snapshots au total.
    storage.set(KEY, [backup, ...all].slice(0, 20));
    JournalService.log("info", "Sauvegarde du projet créée", {
      project: project.name,
      reason,
      files: files.length,
      location,
    });
    CopilotBus.notify();
    return backup;
  },

  rememberNative(
    project: Project,
    reason: ProjectBackup["reason"],
    snapshot: { location: string; files: ProjectBackup["files"] },
  ): ProjectBackup {
    const backup: StoredBackup = {
      id: uid(),
      projectId: project.id,
      reason,
      createdAt: new Date().toISOString(),
      files: snapshot.files,
      location: snapshot.location,
    };
    const all = storage.get<StoredBackup[]>(KEY, []);
    storage.set(KEY, [backup, ...all].slice(0, 20));
    JournalService.log("info", "Sauvegarde native du projet enregistrée", {
      project: project.name,
      reason,
      files: backup.files.length,
      location: backup.location,
    });
    CopilotBus.notify();
    return backup;
  },

  /**
   * Phase 3 — restaure les fichiers d'une sauvegarde. Sous Electron, on
   * recopie les fichiers depuis le snapshot disque. Sous Web, on rejoue
   * le contenu mémorisé (utile pour rejouer une simulation en preview).
   */
  async restore(project: Project, backupId: UUID): Promise<boolean> {
    const all = storage.get<StoredBackup[]>(KEY, []);
    const backup = all.find((b) => b.id === backupId && b.projectId === project.id);
    if (!backup) return false;
    const b = bridge();

    if (b.runtime === "electron" && backup.location) {
      const restored = await b.backups.restore(project.localPath, backup.location, backup.files);
      const ok = restored.files.length === backup.files.length;
      JournalService.log(ok ? "info" : "warn", "Restauration de sauvegarde", {
        project: project.name,
        backupId,
      });
      return ok;
    }

    if (b.runtime === "web" && backup.contents) {
      // Preview Lovable : aucune écriture disque réelle. Les contenus sont
      // conservés uniquement pour simuler un cycle de restauration complet.
      return true;
    }

    return false;
  },
};
