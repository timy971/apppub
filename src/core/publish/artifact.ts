import { bridge } from "@/core/bridge";
import type { Project, PublishRecord } from "@/core/types";

export type PublishArtifactStatus = "valid" | "missing" | "invalid";

export interface PublishArtifactCheck {
  status: PublishArtifactStatus;
  detail: string;
  record?: PublishRecord;
  path?: string;
  size?: number;
}

function freshBuild(history: PublishRecord[], project: Project): PublishRecord | undefined {
  return history.find(
    (record) =>
      record.projectId === project.id &&
      record.kind === "build" &&
      record.outcome === "success" &&
      record.version === project.currentVersion &&
      record.build === project.currentBuild,
  );
}

/**
 * Vérifie l'artefact réel au lieu de faire confiance à la seule trace locale.
 * Un historique de build réussi ne prouve pas que le fichier existe encore
 * ni qu'il porte toujours une signature valide.
 */
export async function verifyPublishArtifact(
  project: Project,
  history: PublishRecord[],
): Promise<PublishArtifactCheck> {
  const record = freshBuild(history, project);
  if (!record) {
    return {
      status: "missing",
      detail: "Aucun build réussi ne correspond à la version et au numéro de build actuels.",
    };
  }
  if (!record.artifactPath) {
    return {
      status: "missing",
      detail: "Le dernier build ne contient aucun chemin vers un fichier AAB.",
      record,
    };
  }

  const b = bridge();
  if (b.runtime === "web") {
    return {
      status: "valid",
      detail: "Artefact simulé disponible dans l'aperçu web.",
      record,
      path: record.artifactPath,
      size: record.artifactSizeBytes,
    };
  }

  try {
    const stat = await b.fs.stat(record.artifactPath);
    if (!stat?.isFile || stat.size <= 0) {
      return {
        status: "missing",
        detail: "Le fichier AAB du dernier build est introuvable ou vide. Relancez le build.",
        record,
        path: record.artifactPath,
      };
    }

    const signature = await b.signing.verifyAab(record.artifactPath);
    if (!signature.ok) {
      return {
        status: "invalid",
        detail:
          signature.errorHint ??
          "Le fichier AAB existe, mais sa signature n'est pas valide. Relancez le build signé.",
        record,
        path: record.artifactPath,
        size: stat.size,
      };
    }

    return {
      status: "valid",
      detail: "Le fichier AAB existe, n'est pas vide et sa signature est valide.",
      record,
      path: record.artifactPath,
      size: stat.size,
    };
  } catch (error) {
    return {
      status: "invalid",
      detail: `Impossible de vérifier le fichier AAB : ${error instanceof Error ? error.message : String(error)}`,
      record,
      path: record.artifactPath,
    };
  }
}
