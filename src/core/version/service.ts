import type { Project, VersionBumpPreview, VersionChangeType } from "@/core/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";

function parse(v: string): [number, number, number] {
  const parts = v.split(".").map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function bump(from: string, type: VersionChangeType): string {
  const [maj, min, pat] = parse(from);
  switch (type) {
    case "bugfix":
      return `${maj}.${min}.${pat + 1}`;
    case "feature":
      return `${maj}.${min + 1}.0`;
    case "major":
      return `${maj + 1}.0.0`;
    case "readonly":
      return from;
  }
}

interface VersionJson {
  version?: string;
  build?: number;
}

export const VersionService = {
  preview(
    project: Project,
    type: VersionChangeType,
    minimumBuild?: number,
  ): VersionBumpPreview {
    const nextBuild = project.currentBuild + 1;
    return {
      from: project.currentVersion,
      to: bump(project.currentVersion, type),
      fromBuild: project.currentBuild,
      newBuild:
        type === "readonly"
          ? project.currentBuild
          : Math.max(nextBuild, minimumBuild ?? nextBuild),
    };
  },

  labelFor(type: VersionChangeType): string {
    return {
      bugfix: "Correction de bug",
      feature: "Nouvelle fonctionnalité",
      major: "Nouvelle version majeure",
      readonly: "Voir uniquement la version",
    }[type];
  },

  /** Phase 2 — lit version.json depuis le disque (retombe sur le projet en Web). */
  async readCurrent(project: Project): Promise<{ version: string; build: number }> {
    const b = bridge();
    if (b.runtime === "electron") {
      const json = await b.fs.readJson<VersionJson>(`${project.localPath}/version.json`);
      if (json?.version) {
        return { version: json.version, build: Number(json.build) || 1 };
      }
    }
    return { version: project.currentVersion, build: project.currentBuild };
  },

  /**
   * Applique la version directement dans la configuration Android. Les projets
   * importés depuis Lovable ou Capacitor n'ont pas à fournir un script maison.
   */
  async apply(
    project: Project,
    type: VersionChangeType,
    onLine?: (line: string) => void,
    minimumBuild?: number,
  ): Promise<{ version: string; build: number }> {
    const b = bridge();
    if (type === "readonly") {
      const preview = this.preview(project, type);
      return { version: preview.to, build: preview.newBuild };
    }
    if (b.runtime !== "electron") {
      throw new Error(
        "La modification réelle de la version nécessite l’application AppPublisher installée.",
      );
    }
    const preview = this.preview(project, type, minimumBuild);
    const desired = {
      versionName: preview.to,
      versionCode: preview.newBuild,
    };
    onLine?.(`Préparation de la version ${desired.versionName} (${desired.versionCode})`);
    const plan = await b.androidCorrections.preview(project.localPath, desired);
    if (plan.blocked.length > 0) {
      throw new Error(plan.blocked[0]);
    }
    if (!plan.canApply) {
      onLine?.("La configuration Android utilise déjà ces numéros.");
      return { version: desired.versionName, build: desired.versionCode };
    }
    const result = await b.androidCorrections.apply(project.localPath, desired, plan.token);
    JournalService.logCommand({
      command: "Mise à jour sécurisée de la configuration Android",
      cwd: project.localPath,
      durationMs: 0,
      exitCode: result.applied ? 0 : 1,
      stdout: result.applied ? `Version ${desired.versionName} (${desired.versionCode})` : "",
      stderr: result.applied ? "" : "Mise à jour annulée",
      message: "Mise à jour de version",
    });
    if (!result.applied) {
      throw new Error(
        result.cancelled
          ? "La mise à jour de la version a été annulée."
          : "La version Android n'a pas pu être modifiée.",
      );
    }
    onLine?.(`Version Android mise à jour : ${desired.versionName} (${desired.versionCode})`);
    return { version: desired.versionName, build: desired.versionCode };
  },
};
