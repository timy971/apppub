import type { DetectedFiles, Project, ProjectDraft, ScannedProject, UUID } from "@/core/types";
import type { GitProjectStatus } from "@/core/bridge/types";
import { storage, STORAGE_KEYS } from "@/core/storage";
import { JournalService } from "@/core/journal/logger";
import { bridge } from "@/core/bridge";
import { diag, diagOp } from "@/core/diag/logger";

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

function draftFromDetected(path: string, detected: DetectedFiles): ProjectDraft {
  return {
    name: detected.displayName || detected.packageName || inferName(path),
    technicalName: detected.packageName,
    logoEmoji: "📱",
    localPath: path,
    packageName: detected.packageName,
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
      hasChangelog: detected.hasChangelog,
    },
  };
}

function sourceFromStatus(status: GitProjectStatus, lastSyncedAt?: string) {
  return {
    type: "git" as const,
    remoteUrl: status.remoteUrl,
    branch: status.branch,
    managed: true as const,
    headSha: status.headSha,
    shortSha: status.shortSha,
    workingTree: status.workingTree,
    relation: status.relation,
    lastCheckedAt: status.checkedAt,
    lastSyncedAt,
  };
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

  update(id: UUID, patch: Partial<Project>, opts?: { touched?: string[] }): Project | undefined {
    const list = this.list();
    const idx = list.findIndex((p) => p.id === id);
    if (idx === -1) return undefined;
    // Marque comme "user" les champs explicitement modifiés depuis l'UI.
    const nextSources: Record<string, "detected" | "user"> = {
      ...(list[idx].fieldSources ?? {}),
    };
    for (const key of opts?.touched ?? []) nextSources[key] = "user";
    const updated: Project = {
      ...list[idx],
      ...patch,
      id,
      updatedAt: now(),
      fieldSources: nextSources,
    };
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
    return diagOp(`ProjectsService.detectFromPath`, async () => {
      diag("service", "detectFromPath:begin", { path });
      JournalService.log("command", "detect", { path });
      const detected = await bridge().projects.detect(path);
      if (!detected) {
        throw new Error(
          "Ce dossier n'est pas encore autorisé. Utilisez le bouton « Parcourir » pour le sélectionner.",
        );
      }
      if (!detected.hasPackageJson) {
        throw new Error(
          "Ce dossier ne contient pas de fichier package.json et ne semble pas être un projet d'application.",
        );
      }
      diag("service", "detectFromPath:bridgeReturned", {
        hasPackageJson: detected.hasPackageJson,
        hasAndroid: detected.hasAndroid,
      });
      return draftFromDetected(path, detected);
    });
  },

  /** Phase 2 — scanne un dossier racine et retourne les projets détectés. */
  async scanFolder(root: string): Promise<ScannedProject[]> {
    return diagOp(`ProjectsService.scanFolder`, async () => {
      diag("service", "scanFolder:begin", { root });
      JournalService.log("command", "scan", { root });
      const r = await bridge().projects.scan(root);
      diag("service", "scanFolder:end", { count: r.length });
      return r;
    });
  },

  /** Phase 2 — crée un projet directement depuis un ScannedProject. */
  saveFromScan(sp: ScannedProject): Project {
    const fieldSources: Record<string, "detected" | "user"> = {};
    if (sp.detected.displayName) fieldSources["name"] = "detected";
    if (sp.detected.packageName) fieldSources["packageName"] = "detected";
    if (sp.detected.currentVersion) fieldSources["currentVersion"] = "detected";
    return this.save({
      name: sp.detected.displayName || sp.detected.packageName || sp.name,
      technicalName: sp.detected.packageName,
      logoEmoji: "📱",
      localPath: sp.path,
      packageName: sp.detected.packageName,
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
        hasChangelog: sp.detected.hasChangelog,
      },
      fieldSources,
    });
  },

  async inspectRemote(remoteUrl: string) {
    return bridge().git.inspectRemote(remoteUrl);
  },

  async importFromGit(remoteUrl: string, branch: string): Promise<Project> {
    const duplicate = this.list().find(
      (project) =>
        project.source?.type === "git" &&
        project.source.remoteUrl === remoteUrl &&
        project.source.branch === branch,
    );
    if (duplicate) {
      throw new Error(
        `Ce dépôt et cette branche sont déjà associés au projet « ${duplicate.name} ».`,
      );
    }
    const cloned = await bridge().git.clone({ remoteUrl, branch });
    if (!cloned.detected.hasPackageJson) {
      throw new Error(
        "Le dépôt a bien été copié, mais il ne contient aucun package.json à sa racine.",
      );
    }
    const draft = draftFromDetected(cloned.localPath, cloned.detected);
    const imported = this.save({
      ...draft,
      githubRepo: cloned.status.remoteUrl,
      defaultBranch: cloned.status.branch,
      source: sourceFromStatus(cloned.status, new Date().toISOString()),
      fieldSources: {
        name: cloned.detected.displayName ? "detected" : "user",
        packageName: cloned.detected.packageName ? "detected" : "user",
        currentVersion: cloned.detected.currentVersion ? "detected" : "user",
        githubRepo: "detected",
        defaultBranch: "detected",
        localPath: "detected",
      },
    });
    JournalService.log("info", "Dépôt Git importé", {
      projectId: imported.id,
      branch: cloned.status.branch,
      commit: cloned.status.headSha,
      reused: cloned.reused,
    });
    return imported;
  },

  async gitStatus(id: UUID): Promise<GitProjectStatus> {
    const project = this.get(id);
    if (!project || project.source?.type !== "git") {
      throw new Error("Ce projet n’est pas lié à une copie Git gérée.");
    }
    const status = await bridge().git.check({
      projectPath: project.localPath,
      remoteUrl: project.source.remoteUrl,
      branch: project.source.branch,
    });
    this.update(id, {
      source: sourceFromStatus(status, project.source.lastSyncedAt),
    });
    return status;
  },

  async syncGit(id: UUID): Promise<GitProjectStatus> {
    const project = this.get(id);
    if (!project || project.source?.type !== "git") {
      throw new Error("Ce projet n’est pas lié à une copie Git gérée.");
    }
    const result = await bridge().git.sync({
      projectPath: project.localPath,
      remoteUrl: project.source.remoteUrl,
      branch: project.source.branch,
    });
    const detectedDraft = draftFromDetected(project.localPath, result.detected);
    const syncedAt = new Date().toISOString();
    this.update(id, {
      technicalName: detectedDraft.technicalName,
      packageName:
        project.fieldSources?.packageName === "user"
          ? project.packageName
          : detectedDraft.packageName,
      currentVersion: detectedDraft.currentVersion,
      currentBuild: detectedDraft.currentBuild,
      detected: detectedDraft.detected,
      source: sourceFromStatus(result.status, syncedAt),
    });
    JournalService.log("info", result.updated ? "Dépôt Git synchronisé" : "Dépôt Git déjà à jour", {
      projectId: id,
      previousCommit: result.previousHeadSha,
      commit: result.status.headSha,
    });
    return result.status;
  },
};
