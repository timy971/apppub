import type { Project } from "@/core/types";

export type StatusSeverity = "info" | "warn" | "error";
export type StatusDomain =
  | "identity"
  | "git"
  | "android"
  | "ios"
  | "build"
  | "publishing"
  | "version";

/**
 * Onglets du cockpit projet. Sert de cible stable pour toute action
 * déclenchée depuis une règle, un widget ou le copilote.
 */
export type CockpitTab =
  | "overview"
  | "identity"
  | "configuration"
  | "publishing"
  | "history";

/**
 * Description d'une action résolvant un problème détecté par une règle.
 * Toute la logique de navigation du cockpit s'appuie exclusivement sur
 * ces coordonnées : onglet cible, éventuelle section, éventuel champ.
 */
export interface RuleAction {
  /** Libellé du bouton présenté à l'utilisateur. */
  label: string;
  /** Onglet du cockpit à ouvrir. */
  tab: CockpitTab;
  /** Section logique dans l'onglet (ex: "android", "ios"). */
  section?: string;
  /** Champ à mettre en évidence (matché via data-cockpit-field="…"). */
  field?: string;
}

export interface RuleOutcome {
  severity: StatusSeverity;
  message: string;
  /** Texte court pédagogique (« pourquoi c'est important »). */
  explanation?: string;
  /** Fallback textuel si aucune action structurée n'est fournie. */
  hint?: string;
  /** Action structurée exécutable depuis le cockpit. */
  action?: RuleAction;
}

export interface RuleFinding extends RuleOutcome {
  id: string;
  domain: StatusDomain;
}

export interface RuleContext {
  project: Project;
}

export interface ProjectRule {
  id: string;
  domain: StatusDomain;
  evaluate(ctx: RuleContext): RuleOutcome | null;
}

export type ProjectStatusLevel = "ready" | "attention" | "blocked";

export interface ProjectStatus {
  level: ProjectStatusLevel;
  label: string;
  findings: RuleFinding[];
  counts: { error: number; warn: number; info: number };
}
