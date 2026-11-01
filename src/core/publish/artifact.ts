import { requireCurrentArtifactSource } from "@/core/projects/release-source";
import { bridge } from "@/core/bridge";
import type { AabValidationReport, Project, PublishRecord } from "@/core/types";
import type { PublicationArtifactRecoveryResult } from "@/core/bridge/types";
import { AabValidationService } from "@/core/aab/service";

export type PublishArtifactStatus = "valid" | "missing" | "invalid";

export interface PublishArtifactCheck {
  status: PublishArtifactStatus;
  detail: string;
  record?: PublishRecord;
  path?: string;
  size?: number;
  validation?: AabValidationReport;
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

function recordFromRecovery(
  project: Project,
  recovered: PublicationArtifactRecoveryResult,
): PublishRecord {
  const storeRelease = recovered.googlePlay
    ? {
        provider: "google-play" as const,
        track: (["internal", "alpha", "beta", "production"].includes(recovered.googlePlay.track)
          ? recovered.googlePlay.track
          : "internal") as "internal" | "alpha" | "beta" | "production",
        packageName: recovered.googlePlay.packageName,
        versionCode: recovered.googlePlay.versionCode,
        releaseStatus: "completed" as const,
        editId: recovered.googlePlay.editId,
        accountEmail: recovered.googlePlay.accountEmail,
        authMode: recovered.googlePlay.authMode,
        committedAt: recovered.googlePlay.committedAt,
      }
    : undefined;
  return {
    id: `manifest-${project.id}-${recovered.versionCode}-${recovered.artifactSha256.slice(0, 12)}`,
    projectId: project.id,
    projectName: recovered.projectName || project.name,
    version: recovered.versionName,
    build: recovered.versionCode,
    user: "AppPublisher",
    durationMs: 0,
    outcome: "success",
    message: storeRelease
      ? "Publication restaurée depuis le manifeste AppPublisher"
      : recovered.notes
        ? "Publication préparée restaurée depuis le manifeste AppPublisher"
        : "Build restauré depuis le manifeste AppPublisher",
    createdAt:
      storeRelease?.committedAt ??
      recovered.preparedAt ??
      recovered.storedAt,
    kind: storeRelease ? "publish" : recovered.notes ? "release-prepared" : "build",
    artifactPath: recovered.artifactPath,
    artifactSizeBytes: recovered.artifactSizeBytes,
    aabReportPath: recovered.reportPath,
    publicationManifestPath: recovered.manifestPath,
    sourceCommit: recovered.sourceCommit,
    sourceDirty: false,
    notes: recovered.notes,
    storeRelease,
  };
}

async function recoverCurrentArtifact(project: Project): Promise<PublishRecord | undefined> {
  const recovered = await bridge().publicationArtifacts.recover({
    projectId: project.id,
    versionName: project.currentVersion,
    versionCode: project.currentBuild,
  });
  return recovered ? recordFromRecovery(project, recovered) : undefined;
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
  const record = freshBuild(history, project) ?? (await recoverCurrentArtifact(project));
  if (!record) {
    return {
      status: "missing",
      detail:
        "Aucun fichier Android vérifié ne correspond à la version et au numéro interne actuels.",
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
    await requireCurrentArtifactSource(project, record.sourceCommit);
    const stat = await b.fs.stat(record.artifactPath);
    if (!stat?.isFile || stat.size <= 0) {
      return {
        status: "missing",
        detail: "Le fichier AAB du dernier build est introuvable ou vide. Relancez le build.",
        record,
        path: record.artifactPath,
      };
    }

    const validation = await AabValidationService.inspect(project, record.artifactPath);
    if (validation.verdict === "blocked") {
      return {
        status: "invalid",
        detail:
          validation.issues.find((issue) => issue.severity === "error")?.detail ??
          "Le contrôle complet de l'AAB signale une erreur bloquante.",
        record,
        path: record.artifactPath,
        size: stat.size,
        validation,
      };
    }

    return {
      status: "valid",
      detail:
        validation.verdict === "warnings"
          ? "L'AAB est publiable, avec des avertissements à contrôler."
          : "L'AAB est conforme au projet et prêt pour Google Play.",
      record,
      path: record.artifactPath,
      size: stat.size,
      validation,
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
