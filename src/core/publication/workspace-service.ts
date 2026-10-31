import type { AndroidCorrectionPlan, Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import {
  createPublicationIntent,
  projectForPublicationWorkspace,
  type PublicationIntent,
} from "./intent";
import type { PublicationWorkspaceResult } from "@/core/bridge/types";

export interface PreparedPublicationWorkspace {
  intent: PublicationIntent;
  workspace: PublicationWorkspaceResult;
  project: Project;
  corrections?: {
    actions: AndroidCorrectionPlan["actions"];
    changedFiles: string[];
  };
  needsAndroidPreparation: boolean;
}

export class PublicationPreparationError extends Error {
  constructor(
    readonly code:
      | "workspace-detection-failed"
      | "intent-application-blocked"
      | "intent-verification-failed",
    message: string,
  ) {
    super(message);
    this.name = "PublicationPreparationError";
  }
}

async function safeRelease(project: Project, workspacePath: string) {
  try {
    await bridge().publicationWorkspace.release({
      projectPath: project.localPath,
      workspacePath,
    });
  } catch {
    // L'erreur d'origine reste prioritaire. Un nettoyage de maintenance pourra
    // supprimer un éventuel worktree orphelin.
  }
}

async function reconcileWorkspace(
  project: Project,
  workspace: PublicationWorkspaceResult,
  intent: PublicationIntent,
): Promise<PreparedPublicationWorkspace> {
  const b = bridge();
  const desired = {
    packageName: intent.applicationId,
    versionName: intent.versionName,
    versionCode: intent.versionCode,
  };
  const plan = await b.androidCorrections.preview(workspace.workspacePath, desired);
  if (plan.blocked.length > 0) {
    throw new PublicationPreparationError(
      "intent-application-blocked",
      "AppPublisher n’a pas pu préparer automatiquement le projet Android : " +
        plan.blocked.join(" "),
    );
  }

  let corrections: PreparedPublicationWorkspace["corrections"];
  if (plan.actions.length > 0) {
    const result = await b.androidCorrections.apply(
      workspace.workspacePath,
      desired,
      plan.token,
    );
    corrections = {
      actions: result.actions ?? plan.actions,
      changedFiles: result.changedFiles ?? plan.changedFiles,
    };
  }

  const detected = await b.projects.detect(workspace.workspacePath);
  if (!detected) {
    throw new PublicationPreparationError(
      "workspace-detection-failed",
      "Le workspace de publication n’a pas pu être relu après sa préparation.",
    );
  }

  const verified = await b.androidCorrections.preview(workspace.workspacePath, desired);
  if (verified.blocked.length > 0 || verified.actions.length > 0) {
    throw new PublicationPreparationError(
      "intent-verification-failed",
      "La préparation Android n’a pas pu être vérifiée après correction.",
    );
  }

  const verifiedWorkspace = { ...workspace, detected };
  return {
    intent,
    workspace: verifiedWorkspace,
    project: projectForPublicationWorkspace(project, verifiedWorkspace, intent),
    corrections,
    needsAndroidPreparation: false,
  };
}

export const PublicationWorkspaceService = {
  async prepare(
    project: Project,
    options: {
      expectedSignerSha256?: string;
      knownPublishedBuilds?: number[];
    } = {},
  ): Promise<PreparedPublicationWorkspace> {
    const b = bridge();
    const intent = createPublicationIntent(project, options);
    const workspace = await b.publicationWorkspace.prepare({
      projectPath: project.localPath,
      remoteUrl: intent.source.remoteUrl,
      branch: intent.source.branch,
    });

    try {
      if (!workspace.detected.hasAndroid) {
        return {
          intent,
          workspace,
          project: projectForPublicationWorkspace(project, workspace, intent),
          needsAndroidPreparation: true,
        };
      }
      return await reconcileWorkspace(project, workspace, intent);
    } catch (error) {
      await safeRelease(project, workspace.workspacePath);
      throw error;
    }
  },

  async reconcile(
    project: Project,
    prepared: PreparedPublicationWorkspace,
  ): Promise<PreparedPublicationWorkspace> {
    if (!prepared.needsAndroidPreparation) return prepared;
    try {
      return await reconcileWorkspace(project, prepared.workspace, prepared.intent);
    } catch (error) {
      await safeRelease(project, prepared.workspace.workspacePath);
      throw error;
    }
  },

  async release(project: Project, prepared: PreparedPublicationWorkspace) {
    return bridge().publicationWorkspace.release({
      projectPath: project.localPath,
      workspacePath: prepared.workspace.workspacePath,
    });
  },
};
