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
 * Les sauvegardes et restaurations sont volontairement indisponibles dans
 * l'aperçu Web : aucune réussite ne doit être annoncée sans écriture réelle.
 */

const KEY = "backups";

type StoredBackup = ProjectBackup;

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
    if (b.runtime !== "electron") {
      throw new Error("La sauvegarde réelle nécessite l’application AppPublisher installée.");
    }
    const files: ProjectBackup["files"] = [];
    const snapshot = await b.backups.create(project.localPath, reason);
    const location = snapshot.location;
    files.push(...snapshot.files);

    const backup: StoredBackup = {
      id: uid(),
      projectId: project.id,
      reason,
      createdAt: new Date().toISOString(),
      files,
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
    changedFiles: string[] = [],
  ): ProjectBackup {
    const backup: StoredBackup = {
      id: uid(),
      projectId: project.id,
      reason,
      createdAt: new Date().toISOString(),
      files: snapshot.files,
      location: snapshot.location,
      changedFiles,
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

  describeChanges(backupId: UUID, changedFiles: string[], createdPaths: string[] = []): void {
    const all = storage.get<StoredBackup[]>(KEY, []);
    storage.set(
      KEY,
      all.map((item) => (item.id === backupId ? { ...item, changedFiles, createdPaths } : item)),
    );
    CopilotBus.notify();
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
    if (b.runtime !== "electron") {
      throw new Error("La restauration réelle nécessite l’application AppPublisher installée.");
    }

    if (backup.location) {
      const restored = backup.createdPaths?.length
        ? await b.backups.restore(
            project.localPath,
            backup.location,
            backup.files,
            backup.createdPaths,
          )
        : await b.backups.restore(project.localPath, backup.location, backup.files);
      const ok = restored.files.length === backup.files.length;
      JournalService.log(ok ? "info" : "warn", "Restauration de sauvegarde", {
        project: project.name,
        backupId,
      });
      return ok;
    }

    return false;
  },
};
