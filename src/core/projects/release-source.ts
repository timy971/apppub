import { bridge } from "@/core/bridge";
import type { Project } from "@/core/types";

/** Refresh the remote at the point of use, never trust a cached green badge. */
export async function requireCurrentGitSource(project: Project) {
  if (project.source?.type !== "git" || bridge().runtime !== "electron") return undefined;
  const status = await bridge().git.check({
    projectPath: project.localPath,
    remoteUrl: project.source.remoteUrl,
    branch: project.source.branch,
  });
  if (status.relation !== "up-to-date") {
    throw new Error(
      `Source Git non synchronisée (${status.shortSha}). Ouvrez Configuration → Projet Git → Synchroniser ou Sauvegarder et synchroniser, puis relancez.`,
    );
  }
  return status;
}

export async function requireCurrentArtifactSource(project: Project, sourceCommit?: string) {
  const status = await requireCurrentGitSource(project);
  if (status && (!sourceCommit || sourceCommit !== status.headSha)) {
    throw new Error(
      "Cet AAB ne correspond pas au code Git à jour, ou son commit est inconnu. Reconstruisez le fichier Android puis préparez à nouveau la publication.",
    );
  }
}

/** Preserve release selection when source metadata still describes an older release. */
export function versionAfterSync(selected: string, detected: string): string {
  const valid = /^\d+\.\d+\.\d+$/;
  if (!valid.test(selected) || !valid.test(detected)) return selected;
  const left = selected.split(".").map(BigInt);
  const right = detected.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] > right[i] ? selected : detected;
  }
  return selected;
}
