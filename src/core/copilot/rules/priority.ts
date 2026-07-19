import { identityRule } from "./identity";
import { configurationRule } from "./configuration";
import { diagnosticRule } from "./diagnostic";
import { versionRule } from "./version";
import { buildRule } from "./build";
import { publishRule } from "./publish";
import { historyRule } from "./history";
import { backupRule } from "./backup";
import type { CopilotRule } from "../types";

/**
 * Ordre indicatif — le moteur re-trie par la propriété `priority` de chaque
 * recommandation. Ajouter Google Play / App Store / GitHub Releases = un
 * fichier ici + un push dans cette liste.
 */
export const COPILOT_RULES: CopilotRule[] = [
  identityRule,
  configurationRule,
  diagnosticRule,
  versionRule,
  buildRule,
  publishRule,
  historyRule,
  backupRule,
];
