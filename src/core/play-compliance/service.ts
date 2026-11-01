import type { AabValidationReport, Project } from "@/core/types";
import { getAndroidConfig } from "@/core/projects/android-config";

export const GOOGLE_PLAY_RULES = Object.freeze({
  mobileTargetSdk: 36,
  targetSdkEffectiveFrom: "2026-08-31",
  personalAccountCutoff: "2023-11-13",
  closedTestersRequired: 12,
  closedTestDaysRequired: 14,
  packageRegistrationEffectiveFrom: "2026-09-30",
});

export type PlayComplianceSeverity = "ok" | "info" | "warn" | "error";

export interface PlayComplianceCheck {
  id: string;
  label: string;
  severity: PlayComplianceSeverity;
  detail: string;
  explanation?: string;
}

export function evaluatePlayCompliance(
  project: Project,
  report?: AabValidationReport,
): PlayComplianceCheck[] {
  const cfg = getAndroidConfig(project);
  const checks: PlayComplianceCheck[] = [];

  const target = report?.targetSdk;
  checks.push({
    id: "play-target-sdk",
    label: "Niveau Android accepté par Google Play",
    severity: target == null ? "warn" : target >= GOOGLE_PLAY_RULES.mobileTargetSdk ? "ok" : "error",
    detail:
      target == null
        ? "Le targetSdk sera vérifié dès qu'un AAB aura été construit."
        : target >= GOOGLE_PLAY_RULES.mobileTargetSdk
          ? `targetSdk ${target} · exigence mobile actuelle : API ${GOOGLE_PLAY_RULES.mobileTargetSdk} minimum.`
          : `targetSdk ${target} · Google Play exige actuellement API ${GOOGLE_PLAY_RULES.mobileTargetSdk} minimum pour une nouvelle app ou une mise à jour.`,
    explanation:
      "Cette règle s'applique aux applications Android mobiles nouvelles et aux mises à jour depuis le 31 août 2026.",
  });

  checks.push({
    id: "play-aab",
    label: "Format Android App Bundle",
    severity: report ? "ok" : "warn",
    detail: report
      ? "Le fichier contrôlé est un AAB lisible par AppPublisher."
      : "Le format AAB sera contrôlé après la création du fichier Android.",
    explanation: "AppPublisher publie un Android App Bundle (.aab) sur Google Play.",
  });

  checks.push({
    id: "play-package-registration",
    label: "Package enregistré pour la validation développeur Android",
    severity:
      cfg.googlePlayPackageRegistration === "registered"
        ? "ok"
        : cfg.googlePlayPackageRegistration === "pending"
          ? "warn"
          : "info",
    detail:
      cfg.googlePlayPackageRegistration === "registered"
        ? "Vous avez confirmé que ce package est enregistré dans Play Console."
        : cfg.googlePlayPackageRegistration === "pending"
          ? "L'enregistrement du package est encore en cours dans Play Console."
          : "À confirmer dans Play Console. Google automatise l'enregistrement de la majorité des apps Play, mais AppPublisher ne peut pas le prouver par l'API utilisée.",
    explanation:
      "Depuis le 30 septembre 2026, les packages Play doivent être enregistrés pour répondre aux exigences de validation développeur Android.",
  });

  checks.push({
    id: "play-developer-verification",
    label: "Compte développeur vérifié",
    severity:
      cfg.googlePlayDeveloperVerification === "verified"
        ? "ok"
        : cfg.googlePlayDeveloperVerification === "pending"
          ? "warn"
          : "info",
    detail:
      cfg.googlePlayDeveloperVerification === "verified"
        ? "Vous avez confirmé que la vérification développeur est terminée."
        : cfg.googlePlayDeveloperVerification === "pending"
          ? "La vérification du compte développeur est encore en cours."
          : "À confirmer dans Play Console. AppPublisher ne marque jamais cette étape comme réussie sans confirmation.",
    explanation:
      "Google exige la vérification du compte développeur avant la soumission d'applications.",
  });

  const newPersonal = cfg.googlePlayAccountKind === "personal-new";
  const closed = cfg.googlePlayClosedTestingStatus;
  checks.push({
    id: "play-closed-testing",
    label: "Accès à la production",
    severity: newPersonal
      ? closed === "completed"
        ? "ok"
        : closed === "pending"
          ? "warn"
          : "warn"
      : cfg.googlePlayAccountKind === "unknown"
        ? "info"
        : "ok",
    detail: newPersonal
      ? closed === "completed"
        ? `Test fermé confirmé : au moins ${GOOGLE_PLAY_RULES.closedTestersRequired} testeurs pendant ${GOOGLE_PLAY_RULES.closedTestDaysRequired} jours continus.`
        : `Pour un compte personnel créé après le 13 novembre 2023, Google demande actuellement ${GOOGLE_PLAY_RULES.closedTestersRequired} testeurs inscrits en continu pendant ${GOOGLE_PLAY_RULES.closedTestDaysRequired} jours avant la demande d'accès production.`
      : cfg.googlePlayAccountKind === "unknown"
        ? "Indiquez le type de compte pour qu'AppPublisher sache si la phase de test fermé obligatoire s'applique."
        : "Le prérequis spécifique aux nouveaux comptes personnels n'est pas applicable d'après le type de compte indiqué.",
    explanation:
      "Cette règle concerne l'accès à la production. Elle ne bloque pas la piste de test interne utilisée aujourd'hui par AppPublisher.",
  });

  return checks;
}
