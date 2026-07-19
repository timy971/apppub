import type { HealthCheck, Project, ProjectBackup, PublishRecord } from "@/core/types";
import type { ProjectStatus, CockpitTab } from "@/core/projects/status";

/**
 * Copilot Intelligence 2.0 — modèle partagé par TOUTE l'application.
 *
 * Le Copilot n'invente rien. Il agrège les signaux produits par les
 * services existants (ProjectStatusService, DiagnosticService,
 * HistoryService, BackupService, ReleaseNotesService, AppStore) et
 * produit un plan unique consommable par le Dashboard, le Cockpit,
 * le Publish Center, le Build Center et les futurs modules.
 */

export type CopilotStatus = "ready" | "attention" | "blocked";
export type CopilotPriority = "low" | "medium" | "high";
export type CopilotEventKind = "success" | "warning" | "blocking" | "information";
export type CopilotStepStatus = "done" | "current" | "upcoming" | "blocked";

/** Étape logique d'un projet, de la création à la publication. */
export interface CopilotStep {
  id: string;
  title: string;
  status: CopilotStepStatus;
  hint?: string;
}

/** Une action concrète que l'utilisateur peut lancer immédiatement. */
export interface CopilotAction {
  title: string;
  description: string;
  route: string;
  priority: CopilotPriority;
  /** Optionnel : onglet cockpit ciblé pour un deep-link intelligent. */
  cockpitTab?: CockpitTab;
}

/** Une information positive, neutre ou d'alerte affichable telle quelle. */
export interface CopilotInsight {
  id: string;
  kind: CopilotEventKind;
  title: string;
  description?: string;
  route?: string;
}

/** Contexte d'entrée injecté au moteur. */
export interface CopilotRuleContext {
  project: Project | undefined;
  status: ProjectStatus | null;
  checks: HealthCheck[];
  history: PublishRecord[];
  backups: ProjectBackup[];
}

/** Sortie d'une règle : n recommandations, chacune indépendante. */
export interface CopilotRecommendation {
  id: string;
  kind: CopilotEventKind;
  /** Ordre de priorité (plus petit = plus urgent). */
  priority: number;
  headline: string;
  description?: string;
  action?: CopilotAction;
  /** Étape logique validée par cette recommandation (mode success). */
  completedStepId?: string;
}

/** Contrat d'une règle. */
export interface CopilotRule {
  id: string;
  evaluate(ctx: CopilotRuleContext): CopilotRecommendation[] | CopilotRecommendation | null;
}

/** Le plan complet — SEULE vérité que consomment les écrans. */
export interface CopilotPlan {
  overallStatus: CopilotStatus;
  score: number;
  headline: string;
  summary: string;
  nextAction: CopilotAction;
  steps: CopilotStep[];
  insights: CopilotInsight[];
  warnings: CopilotInsight[];
  completed: string[];
  /** Estimation minutes pour la prochaine publication complète. */
  etaMinutes: number;
  /** Signature stable — utilisable comme clé de cache. */
  signature: string;
}
