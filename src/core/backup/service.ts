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
 * (version.json, package.json, CHANGELOG.md quand présents) sont copiés
 * à l'identique. `restore()` permet de remettre le projet dans cet état.
 *
 * Sous Web (preview Lovable), on garde uniquement une trace mémoire
 * (métadonnées + contenu texte) pour continuer à faire fonctionner l'UI.
 */

const KEY = "backups";
const BACKUPS_FOLDER = ".apppublisher-backups";

interface StoredBackup extends ProjectBackup {
  contents?: Record<string, string>;
}

const CRITICAL = ["version.json", "package.json", "CHANGELOG.md"];

function uid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
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
      // Snapshot réel sur disque, sous la racine du projet (donc autorisé
      // par le confinement fs:*).
      location = `${project.localPath}/${BACKUPS_FOLDER}/${stamp()}-${reason}`;
      await b.fs.mkdir(location);
      for (const rel of CRITICAL) {
        const src = `${project.localPath}/${rel}`;
        const stat = await b.fs.stat(src);
        if (!stat?.isFile) continue;
        const copied = await b.fs.copyFile(src, `${location}/${rel}`);
        if (copied) files.push({ path: rel, size: stat.size });
      }
    } else {
      for (const rel of CRITICAL) {
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
      let ok = true;
      for (const f of backup.files) {
        const src = `${backup.location}/${f.path}`;
        const dest = `${project.localPath}/${f.path}`;
        const done = await b.fs.copyFile(src, dest);
        if (!done) ok = false;
      }
      JournalService.log(ok ? "info" : "warn", "Restauration de sauvegarde", {
        project: project.name,
        backupId,
      });
      return ok;
    }

    if (b.runtime === "web" && backup.contents) {
      for (const [rel, text] of Object.entries(backup.contents)) {
        await b.fs.writeText(`${project.localPath}/${rel}`, text);
      }
      return true;
    }

    return false;
  },
};
