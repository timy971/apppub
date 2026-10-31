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
    // L'erreur d'origine reste prioritaire. Les worktrees orphelins pourront
    // être nettoyés par la maintenance du Lot 12.
  }
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
      let workspaceProject = projectForPublicationWorkspace(project, workspace, intent);

      if (!workspace.detected.hasAndroid) {
        return {
          intent,
          workspace,
          project: workspaceProject,
          needsAndroidPreparation: true,
        };
      }

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
          actions: result.actions,
          changedFiles: result.changedFiles,
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

      workspaceProject = projectForPublicationWorkspace(
        project,
        { ...workspace, detected },
        intent,
      );
      return {
        intent,
        workspace: { ...workspace, detected },
        project: workspaceProject,
        corrections,
        needsAndroidPreparation: false,
      };
    } catch (error) {
      await safeRelease(project, workspace.workspacePath);
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
