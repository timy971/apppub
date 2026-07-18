import type { ProjectRule } from "../types";

export const identityRules: ProjectRule[] = [
  {
    id: "identity.name",
    domain: "identity",
    evaluate: ({ project }) =>
      project.name.trim().length > 0
        ? null
        : {
            severity: "error",
            message: "Le projet n'a pas de nom.",
            hint: "Renseignez un nom dans l'onglet Identité.",
          },
  },
  {
    id: "identity.path",
    domain: "identity",
    evaluate: ({ project }) =>
      project.localPath.trim().length > 0
        ? null
        : {
            severity: "error",
            message: "Aucun dossier local n'est associé au projet.",
            hint: "Sélectionnez le dossier du projet.",
          },
  },
  {
    id: "identity.package",
    domain: "identity",
    evaluate: ({ project }) =>
      project.detected.hasPackageJson
        ? null
        : {
            severity: "warn",
            message: "Aucun fichier package.json détecté dans le dossier.",
            hint: "Vérifiez que le chemin pointe bien à la racine de l'application.",
          },
  },
];
