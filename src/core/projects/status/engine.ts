import type {
  ProjectRule,
  ProjectStatus,
  ProjectStatusLevel,
  RuleContext,
  RuleFinding,
} from "./types";

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 } as const;

/**
 * Exécute une liste de règles et agrège leurs résultats en un statut unique.
 * Le moteur ne connaît aucun domaine — ajouter une nouvelle plateforme se
 * limite à écrire un nouveau fichier de règles et à l'enregistrer.
 */
export function runRules(rules: ProjectRule[], ctx: RuleContext): ProjectStatus {
  const findings: RuleFinding[] = [];
  for (const rule of rules) {
    const outcome = rule.evaluate(ctx);
    if (!outcome) continue;
    findings.push({ ...outcome, id: rule.id, domain: rule.domain });
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  const level: ProjectStatusLevel = counts.error
    ? "blocked"
    : counts.warn
      ? "attention"
      : "ready";

  const label =
    level === "ready"
      ? "Prêt"
      : level === "attention"
        ? "À surveiller"
        : "Action requise";

  return { level, label, findings, counts };
}
