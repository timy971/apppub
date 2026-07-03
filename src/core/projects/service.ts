import type { Project, ProjectDraft, ScannedProject, UUID } from "@/core/types";
import { storage, STORAGE_KEYS } from "@/core/storage";
import { JournalService } from "@/core/journal/logger";
import { bridge } from "@/core/bridge";

function uuid(): UUID {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function now(): string {
  return new Date().toISOString();
}

function inferName(p: string): string {
  const clean = p.replace(/[\\/]+$/, "");
  const last = clean.split(/[\\/]/).pop() ?? "Mon projet";
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export const ProjectsService = {
  list(): Project[] {
    return storage.get<Project[]>(STORAGE_KEYS.projects, []);
  },

  get(id: UUID): Project | undefined {
    return this.list().find((p) => p.id === id);
  },

  save(draft: ProjectDraft): Project {
    const project: Project = {
      ...draft,
      id: uuid(),
      createdAt: now(),
      updatedAt: now(),
    };
    storage.set(STORAGE_KEYS.projects, [...this.list(), project]);
    JournalService.log("info", "Projet ajouté", { id: project.id, name: project.name });
    return project;
  },

  update(id: UUID, patch: Partial<Project>): Project | undefined {
    const list = this.list();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    const updated: Project = { ...list[idx], ...patch, id, updatedAt: now() };
    list[idx] = updated;
    storage.set(STORAGE_KEYS.projects, list);
    return updated;
  },

  remove(id: UUID): void {
    storage.set(
      STORAGE_KEYS.projects,
      this.list().filter((p) => p.id !== id),
    );
    JournalService.log("info", "Projet supprimé", { id });
  },

  /**
   * Détection d'un projet ponctuel — passe par le bridge (réel en Electron,
   * simulé en Web). L'API publique n'a pas changé depuis Phase 1.
   */
  async detectFromPath(path: string): Promise<ProjectDraft> {
    JournalService.log("command", "detect", { path });
    const detected = await bridge().projects.detect(path);
    return {
      name: detected.packageName || inferName(path),
      logoEmoji: "📱",
      localPath: path,
      currentVersion: detected.currentVersion || "1.0.0",
      currentBuild: detected.currentBuild || 1,
      detected: {
        hasPackageJson: detected.hasPackageJson,
        hasAndroid: detected.hasAndroid,
        hasIos: detected.hasIos,
        hasVersionJson: detected.hasVersionJson,
        hasCapacitorConfig: detected.hasCapacitorConfig,
        hasVersionScript: detected.hasVersionScript,
        hasGradleWrapper: detected.hasGradleWrapper,
      },
    };
  },

  /** Phase 2 — scanne un dossier racine et retourne les projets détectés. */
  async scanFolder(root: string): Promise<ScannedProject[]> {
    JournalService.log("command", "scan", { root });
    return bridge().projects.scan(root);
  },

  /** Phase 2 — crée un projet directement depuis un ScannedProject. */
  saveFromScan(sp: ScannedProject): Project {
    return this.save({
      name: sp.name,
      logoEmoji: "📱",
      localPath: sp.path,
      currentVersion: sp.detected.currentVersion || "1.0.0",
      currentBuild: sp.detected.currentBuild || 1,
      detected: {
        hasPackageJson: sp.detected.hasPackageJson,
        hasAndroid: sp.detected.hasAndroid,
        hasIos: sp.detected.hasIos,
        hasVersionJson: sp.detected.hasVersionJson,
        hasCapacitorConfig: sp.detected.hasCapacitorConfig,
        hasVersionScript: sp.detected.hasVersionScript,
        hasGradleWrapper: sp.detected.hasGradleWrapper,
      },
    });
  },
};
