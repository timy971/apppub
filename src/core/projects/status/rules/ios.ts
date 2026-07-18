import type { ProjectRule } from "../types";

/**
 * Règles iOS — actives dès que la plateforme iOS est détectée ou activée
 * manuellement via publishing.ios. Prépare l'intégration future App Store
 * Connect sans casser l'existant.
 */
export const iosRules: ProjectRule[] = [
  {
    id: "ios.bundleId",
    domain: "ios",
    evaluate: ({ project }) => {
      if (!project.detected.hasIos && !project.publishing?.ios) return null;
      const bundleId = project.publishing?.ios?.bundleId?.trim();
      return bundleId
        ? null
        : {
            severity: "warn",
            message: "L'identifiant iOS (bundle id) n'est pas renseigné.",
            explanation:
              "Le bundle id identifie votre app auprès d'App Store Connect (ex : com.entreprise.monapp).",
            action: {
              label: "Renseigner le bundle id",
              tab: "publishing",
              section: "ios",
              field: "ios.bundleId",
            },
          };
    },
  },
];
