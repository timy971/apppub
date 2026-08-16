import { bridge } from "@/core/bridge";
import { BackupService } from "@/core/backup/service";
import { JournalService } from "@/core/journal/logger";
import { ProjectsService } from "@/core/projects/service";
import type {
  AabValidationReport,
  AndroidCorrectionDesired,
  AndroidCorrectionPlan,
  AndroidCorrectionResult,
  Project,
} from "@/core/types";

export interface AndroidManualCorrection {
  issueId: string;
  title: string;
  detail: string;
  destination?: "identity" | "signing" | "build";
}

export function desiredCorrections(report: AabValidationReport): AndroidCorrectionDesired {
  const issueIds = new Set(report.issues.map((issue) => issue.id));
  const desired: AndroidCorrectionDesired = {};
  if (issueIds.has("package-mismatch") && report.expected.packageName) {
    desired.packageName = report.expected.packageName;
  }
  if (issueIds.has("version-name-mismatch") && report.expected.versionName) {
    desired.versionName = report.expected.versionName;
  }
  if (issueIds.has("version-code-mismatch") && report.expected.versionCode != null) {
    desired.versionCode = report.expected.versionCode;
  }
  if (
    issueIds.has("sdk-invalid") &&
    report.minSdk != null &&
    report.targetSdk != null &&
    report.targetSdk < report.minSdk
  ) {
    desired.targetSdk = report.minSdk;
  }
  return desired;
}

export function manualCorrections(report: AabValidationReport): AndroidManualCorrection[] {
  const guidance: Record<string, Omit<AndroidManualCorrection, "issueId">> = {
    "signer-mismatch": {
      title: "Choisir le profil de signature attendu",
      detail:
        "Réassociez le bon profil dans la fiche du projet. AppPublisher ne remplacera jamais une clé automatiquement.",
      destination: "signing",
    },
    "expected-signer-missing": {
      title: "Enregistrer l’empreinte du profil",
      detail: "Validez ou réimportez le profil de signature avant le prochain build.",
      destination: "signing",
    },
    "signature-invalid": {
      title: "Réparer la signature du build",
      detail: "Contrôlez le keystore, son alias et les secrets du trousseau système.",
      destination: "signing",
    },
    "bundletool-unavailable": {
      title: "Installer ou embarquer bundletool",
      detail:
        "Le contrôle interne est terminé, mais la validation officielle doit encore être exécutée.",
      destination: "build",
    },
    "bundletool-failed": {
      title: "Consulter le rapport bundletool",
      detail: "La structure du bundle doit être corrigée avant une nouvelle construction.",
      destination: "build",
    },
    "sdk-unreadable": {
      title: "Rendre les SDK explicites",
      detail:
        "Le SDK est calculé dynamiquement ou illisible. AppPublisher refuse de modifier une expression qu’il ne peut pas prouver.",
      destination: "build",
    },
  };
  return report.issues.flatMap((issue) => {
    const item = guidance[issue.id];
    return item ? [{ issueId: issue.id, ...item }] : [];
  });
}

export const AndroidCorrectionService = {
  async preview(
    project: Project,
    report: AabValidationReport,
  ): Promise<AndroidCorrectionPlan | null> {
    const desired = desiredCorrections(report);
    if (Object.keys(desired).length === 0) return null;
    return bridge().androidCorrections.preview(project.localPath, desired);
  },

  async apply(project: Project, plan: AndroidCorrectionPlan): Promise<AndroidCorrectionResult> {
    const result = await bridge().androidCorrections.apply(
      project.localPath,
      plan.desired,
      plan.token,
    );
    if (!result.applied) return result;
    if (!result.backup && bridge().runtime === "electron") {
      throw new Error("La correction a été appliquée, mais sa sauvegarde n’a pas été retournée.");
    }
    if (result.backup) {
      BackupService.rememberNative(project, "correction", result.backup, result.changedFiles);
    }
    await ProjectsService.refreshDetection(project.id);
    JournalService.log("info", "Corrections Android appliquées", {
      projectId: project.id,
      files: result.changedFiles,
      actions: result.actions?.map((action) => action.id),
    });
    return result;
  },
};
