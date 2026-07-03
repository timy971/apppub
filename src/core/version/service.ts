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
  preview(project: Project, type: VersionChangeType): VersionBumpPreview {
    return {
      from: project.currentVersion,
      to: bump(project.currentVersion, type),
      fromBuild: project.currentBuild,
      newBuild: type === "readonly" ? project.currentBuild : project.currentBuild + 1,
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
   * Phase 2 — applique une nouvelle version en exécutant le script officiel
   * du projet. En Web, on simule (le workflow engine gère l'affichage).
   */
  async apply(
    project: Project,
    type: VersionChangeType,
    onLine?: (line: string) => void,
  ): Promise<{ version: string; build: number }> {
    const b = bridge();
    if (b.runtime === "web" || type === "readonly") {
      const preview = this.preview(project, type);
      return { version: preview.to, build: preview.newBuild };
    }
    const scriptArg =
      type === "bugfix" ? "patch" : type === "feature" ? "minor" : "major";
    const result = await b.exec.run(
      {
        cmd: "node",
        args: ["scripts/version.mjs", scriptArg],
        cwd: project.localPath,
        timeoutMs: 60_000,
      },
      onLine ? (l) => onLine(l.line) : undefined,
    );
    JournalService.logCommand({
      command: `node scripts/version.mjs ${scriptArg}`,
      cwd: project.localPath,
      durationMs: result.durationMs,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      message: "Mise à jour de version",
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "Échec du script de version");
    }
    return this.readCurrent(project);
  },
};
