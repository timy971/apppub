import type { Project, ProjectBackup, UUID } from "@/core/types";
import { storage } from "@/core/storage";
import { JournalService } from "@/core/journal/logger";
import { bridge } from "@/core/bridge";

/**
 * BackupService — sauvegarde légère avant une opération sensible.
 *
 * Phase 2 : on mémorise l'état des fichiers critiques (version.json,
 * package.json) et leur contenu textuel en localStorage. Pas de restauration
 * automatique tant qu'Electron n'expose pas d'écriture disque — l'API est
 * prête pour la Phase 3.
 */

const KEY = "backups";

interface StoredBackup extends ProjectBackup {
  contents?: Record<string, string>;
}

const CRITICAL = ["version.json", "package.json"];

function uid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export const BackupService = {
  list(projectId: UUID): ProjectBackup[] {
    return storage
      .get<StoredBackup[]>(KEY, [])
      .filter((b) => b.projectId === projectId);
  },

  async create(
    project: Project,
    reason: ProjectBackup["reason"],
  ): Promise<ProjectBackup> {
    const b = bridge();
    const files: ProjectBackup["files"] = [];
    const contents: Record<string, string> = {};
    for (const rel of CRITICAL) {
      const p = `${project.localPath}/${rel}`;
      const stat = await b.fs.stat(p);
      if (!stat?.isFile) continue;
      files.push({ path: rel, size: stat.size });
      const text = await b.fs.readText(p);
      if (text != null) contents[rel] = text;
    }
    const backup: StoredBackup = {
      id: uid(),
      projectId: project.id,
      reason,
      createdAt: new Date().toISOString(),
      files,
      contents,
    };
    const all = storage.get<StoredBackup[]>(KEY, []);
    // On garde les 20 derniers snapshots au total.
    storage.set(KEY, [backup, ...all].slice(0, 20));
    JournalService.log("info", "Sauvegarde du projet créée", {
      project: project.name,
      reason,
      files: files.length,
    });
    return backup;
  },
};
