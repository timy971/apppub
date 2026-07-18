import type { ProjectRule } from "../types";

/**
 * Règles iOS — dormantes tant que la plateforme iOS n'est pas détectée
 * ou activée manuellement via publishing.ios. Elles seront enrichies au
 * moment où le support App Store Connect sera prioritaire.
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
            hint: "Renseignez-le dans l'onglet Publication → iOS.",
          };
    },
  },
];
