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
            explanation:
              "Le nom identifie le projet dans AppPublisher et dans vos futures publications.",
            action: {
              label: "Renseigner le nom",
              tab: "identity",
              section: "identity",
              field: "name",
            },
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
            explanation:
              "AppPublisher a besoin d'un dossier local pour lire la version, le code et générer les builds.",
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
            explanation:
              "Sans package.json, AppPublisher ne peut pas déterminer les scripts de build.",
            hint: "Vérifiez que le chemin pointe bien à la racine de l'application.",
          },
  },
];
