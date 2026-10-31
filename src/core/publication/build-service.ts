import type { Project, PublishRecord } from "@/core/types";
import { bridge } from "@/core/bridge";
import { BuildService, type BuildResult, type BuildRunOptions } from "@/core/build/service";
import { CapacitorService } from "@/core/capacitor/service";
import { HistoryService } from "@/core/history/service";
import { JournalService } from "@/core/journal/logger";
import {
  PublicationWorkspaceService,
  type PreparedPublicationWorkspace,
} from "./workspace-service";

function knownPublishedBuilds(project: Project): number[] {
  return HistoryService.list()
    .filter(
      (record: PublishRecord) =>
        record.projectId === project.id &&
        record.outcome === "success" &&
        record.storeRelease?.provider === "google-play",
    )
    .map((record) => record.storeRelease?.versionCode ?? record.build)
    .filter((value): value is number => Number.isSafeInteger(value) && value > 0);
}

async function prepareAndroidIfNeeded(
  originalProject: Project,
  prepared: PreparedPublicationWorkspace,
  opts: BuildRunOptions,
): Promise<PreparedPublicationWorkspace> {
  if (!prepared.needsAndroidPreparation) return prepared;

  opts.onStep("prepare", "running", "Création automatique du projet Android…");
  opts.onLine?.("Le commit source ne contient pas encore Android : préparation dans le workspace jetable.");

  const analysis = await CapacitorService.inspect(prepared.project.localPath);
  if (analysis.status === "blocked") {
    throw new Error(
      analysis.blockers[0] ??
        "Ce projet ne peut pas être préparé automatiquement pour Android.",
    );
  }

  const result = await CapacitorService.prepareAndroid(
    prepared.project,
    {
      appName: analysis.appName || originalProject.name,
      applicationId: prepared.intent.applicationId,
      webDir: analysis.webDir,
      packageManager: analysis.packageManager,
    },
    {
      signal: opts.signal,
      onLine: opts.onLine,
      onStep: (_id, status, detail) => {
        if (status === "error") opts.onStep("prepare", "error", detail);
        else if (detail) opts.onStep("prepare", "running", detail);
      },
    },
  );

  if (result.outcome.kind === "failed") {
    throw new Error(result.outcome.message || "La préparation Android automatique a échoué.");
  }

  opts.onLine?.("Projet Android créé dans le workspace. Vérification de l’intention de publication…");
  return PublicationWorkspaceService.reconcile(originalProject, prepared);
}

export interface PublicationBuildResult extends BuildResult {
  versionName?: string;
  versionCode?: number;
  applicationId?: string;
  publicationManifestPath?: string;
  publicationStoredAt?: string;
}

export const PublicationBuildService = {
  async build(project: Project, opts: BuildRunOptions): Promise<PublicationBuildResult> {
    const b = bridge();

    // Compatibilité avec les projets locaux historiques et l'aperçu web :
    // le pipeline jetable s'applique uniquement aux dépôts Git gérés.
    if (b.runtime !== "electron" || project.source?.type !== "git") {
      opts.onStep("prepare", "success", "Projet prêt.");
      return BuildService.build(project, opts);
    }

    let prepared: PreparedPublicationWorkspace | undefined;
    try {
      opts.onStep("prepare", "running", "Création d’une source de publication propre…");
      prepared = await PublicationWorkspaceService.prepare(project, {
        knownPublishedBuilds: knownPublishedBuilds(project),
      });
      opts.onLine?.(
        `Source figée : ${prepared.workspace.branch} @ ${prepared.workspace.shortSha}`,
      );

      prepared = await prepareAndroidIfNeeded(project, prepared, opts);
      opts.onStep(
        "prepare",
        "success",
        prepared.intent.adjustments.length
          ? `Projet prêt · numéro interne ajusté automatiquement à ${prepared.intent.versionCode}.`
          : "Projet prêt depuis une source propre.",
      );

      const built = await BuildService.build(prepared.project, {
        ...opts,
        preparedSource: {
          managedProjectPath: project.localPath,
          sourceSha: prepared.workspace.sourceSha,
        },
      });

      if (!built.aabPath) {
        throw new Error("Le build a réussi sans fournir de fichier Android à archiver.");
      }

      opts.onStep("archive", "running", "Conservation du fichier Android hors du workspace…");
      const promoted = await b.publicationArtifacts.promote({
        projectId: project.id,
        projectName: project.name,
        projectPath: project.localPath,
        workspacePath: prepared.workspace.workspacePath,
        aabPath: built.aabPath,
        reportPath: built.aabReportPath,
        sourceSha: prepared.workspace.sourceSha,
        branch: prepared.workspace.branch,
        applicationId: prepared.intent.applicationId,
        versionName: prepared.intent.versionName,
        versionCode: prepared.intent.versionCode,
        signerSha256: built.signatureSha256,
        artifactSha256: built.artifactSha256,
        corrections: [
          ...(prepared.corrections?.changedFiles ?? []),
          ...(prepared.workspace.detected.hasAndroid ? [] : ["android/"]),
        ],
        adjustments: prepared.intent.adjustments.map((item) => ({ ...item })),
      });
      opts.onStep("archive", "success", "Fichier Android conservé par AppPublisher.");

      return {
        ...built,
        aabPath: promoted.artifactPath,
        aabSize: promoted.artifactSizeBytes,
        aabReportPath: promoted.reportPath,
        aabValidation: built.aabValidation
          ? { ...built.aabValidation, reportPath: promoted.reportPath }
          : built.aabValidation,
        artifactSha256: promoted.artifactSha256,
        sourceCommit: prepared.workspace.sourceSha,
        sourceDirty: false,
        versionName: prepared.intent.versionName,
        versionCode: prepared.intent.versionCode,
        applicationId: prepared.intent.applicationId,
        publicationManifestPath: promoted.manifestPath,
        publicationStoredAt: promoted.storedAt,
      };
    } finally {
      if (prepared) {
        try {
          await PublicationWorkspaceService.release(project, prepared);
          opts.onLine?.("Workspace temporaire supprimé.");
        } catch (error) {
          JournalService.log("warn", "Workspace de publication non supprimé", {
            projectId: project.id,
            error: error instanceof Error ? error.message : String(error),
          });
          opts.onLine?.("Le fichier final est conservé, mais le nettoyage du workspace sera repris plus tard.");
        }
      }
    }
  },
};
