import type { DetectedFiles, GitRelation, Project } from "@/core/types";
import type { PublicationWorkspaceResult } from "@/core/bridge/types";
import { getAndroidConfig } from "@/core/projects/android-config";

export interface PublicationIntentAdjustment {
  kind: "version-code";
  from: number;
  to: number;
  reason: "google-play-already-used";
}

export interface PublicationIntent {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  source: {
    remoteUrl: string;
    branch: string;
  };
  versionName: string;
  requestedVersionCode: number;
  versionCode: number;
  applicationId: string;
  signingProfileId?: string;
  expectedSignerSha256?: string;
  adjustments: PublicationIntentAdjustment[];
}

export class PublicationIntentError extends Error {
  constructor(
    readonly code:
      | "git-source-required"
      | "android-identity-missing"
      | "version-invalid"
      | "version-code-invalid",
    message: string,
  ) {
    super(message);
    this.name = "PublicationIntentError";
  }
}

export function isAndroidApplicationId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length < 3 || trimmed.length > 255) return false;
  // AppPublisher accepte seulement des identifiants de type package Java,
  // avec au moins deux segments. Un nom npm comme vite_react_shadcn_ts est
  // donc explicitement exclu.
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(trimmed);
}

export function resolvePublicationApplicationId(project: Project): string | undefined {
  const android = getAndroidConfig(project);
  const candidates = [
    android.applicationId,
    project.playStoreAppId,
    project.detected?.capacitorAppId,
    project.packageName,
  ];
  return candidates.find(isAndroidApplicationId)?.trim();
}

function positiveBuild(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function validVersionName(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value.trim());
}

export function createPublicationIntent(
  project: Project,
  options: {
    expectedSignerSha256?: string;
    knownPublishedBuilds?: number[];
  } = {},
): PublicationIntent {
  if (project.source?.type !== "git") {
    throw new PublicationIntentError(
      "git-source-required",
      "Cette publication doit être rattachée à une source Git gérée par AppPublisher.",
    );
  }

  const applicationId = resolvePublicationApplicationId(project);
  if (!applicationId) {
    throw new PublicationIntentError(
      "android-identity-missing",
      "AppPublisher n’a trouvé aucun identifiant Android fiable. Il doit être corrigé automatiquement ou confirmé avant la publication.",
    );
  }

  const versionName = project.currentVersion?.trim();
  if (!validVersionName(versionName)) {
    throw new PublicationIntentError(
      "version-invalid",
      "La version sélectionnée n’est pas une version Android valide.",
    );
  }

  if (!positiveBuild(project.currentBuild)) {
    throw new PublicationIntentError(
      "version-code-invalid",
      "Le numéro interne Android doit être un entier positif.",
    );
  }

  const knownBuilds = [
    project.publishing?.android?.googlePlayLastKnownBuild,
    ...(options.knownPublishedBuilds ?? []),
  ].filter(positiveBuild);
  const highestKnownBuild = knownBuilds.length ? Math.max(...knownBuilds) : 0;
  const requestedVersionCode = project.currentBuild;
  const versionCode =
    requestedVersionCode <= highestKnownBuild ? highestKnownBuild + 1 : requestedVersionCode;
  const adjustments: PublicationIntentAdjustment[] =
    versionCode === requestedVersionCode
      ? []
      : [
          {
            kind: "version-code",
            from: requestedVersionCode,
            to: versionCode,
            reason: "google-play-already-used",
          },
        ];

  return {
    schemaVersion: 1,
    projectId: project.id,
    projectName: project.name,
    source: {
      remoteUrl: project.source.remoteUrl,
      branch: project.source.branch,
    },
    versionName,
    requestedVersionCode,
    versionCode,
    applicationId,
    signingProfileId: getAndroidConfig(project).signingProfileId,
    expectedSignerSha256: options.expectedSignerSha256
      ?.replace(/[^0-9a-f]/gi, "")
      .toUpperCase() || undefined,
    adjustments,
  };
}

export function projectForPublicationWorkspace(
  project: Project,
  workspace: PublicationWorkspaceResult,
  intent: PublicationIntent,
): Project {
  if (project.id !== intent.projectId) {
    throw new Error("L’intention de publication ne correspond pas à ce projet.");
  }
  if (
    workspace.remoteUrl !== intent.source.remoteUrl ||
    workspace.branch !== intent.source.branch
  ) {
    throw new Error("Le workspace ne correspond pas à la source prévue pour cette publication.");
  }

  const detected: DetectedFiles = workspace.detected;
  const sourceRelation: GitRelation = "up-to-date";
  return {
    ...project,
    localPath: workspace.workspacePath,
    currentVersion: intent.versionName,
    currentBuild: intent.versionCode,
    detected: {
      ...detected,
      // L'identité de publication est volontairement pilotée par l'intention,
      // même si le commit distant contient encore une ancienne valeur.
      capacitorAppId: intent.applicationId,
    },
    publishing: {
      ...(project.publishing ?? {}),
      android: {
        ...(project.publishing?.android ?? {}),
        applicationId: intent.applicationId,
        signingProfileId:
          intent.signingProfileId ?? project.publishing?.android?.signingProfileId,
      },
    },
    source: {
      type: "git",
      managed: true,
      remoteUrl: workspace.remoteUrl,
      branch: workspace.branch,
      headSha: workspace.sourceSha,
      shortSha: workspace.shortSha,
      workingTree: "clean",
      relation: sourceRelation,
      lastCheckedAt: workspace.createdAt,
      lastSyncedAt: project.source?.lastSyncedAt,
    },
  };
}
