import type { Project } from "@/core/types";
import { runRules } from "./engine";
import type { ProjectRule, ProjectStatus } from "./types";
import { identityRules } from "./rules/identity";
import { versionRules } from "./rules/version";
import { gitRules } from "./rules/git";
import { androidRules } from "./rules/android";
import { iosRules } from "./rules/ios";
import { buildRules } from "./rules/build";

/**
 * Registre des règles. L'ordre est indicatif — le moteur re-trie par sévérité.
 * Ajouter une nouvelle plateforme = importer un nouveau tableau ici.
 */
const REGISTRY: ProjectRule[] = [
  ...identityRules,
  ...versionRules,
  ...gitRules,
  ...androidRules,
  ...iosRules,
  ...buildRules,
];

export const ProjectStatusService = {
  evaluate(project: Project): ProjectStatus {
    return runRules(REGISTRY, { project });
  },
  rules(): ProjectRule[] {
    return REGISTRY.slice();
  },
};

export type { ProjectStatus, ProjectStatusLevel, RuleFinding, StatusSeverity, StatusDomain } from "./types";
