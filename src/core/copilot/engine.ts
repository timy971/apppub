import type {
  CopilotAction,
  CopilotInsight,
  CopilotPlan,
  CopilotRecommendation,
  CopilotRule,
  CopilotRuleContext,
  CopilotStatus,
  CopilotStep,
  CopilotStepStatus,
} from "./types";
import { COPILOT_RULES } from "./rules/priority";

/**
 * Moteur du Copilot Intelligence 2.0.
 *
 * Le moteur ne connaît aucun domaine métier. Il exécute la liste des règles
 * fournies par le registre, agrège les recommandations, calcule un plan
 * unique consommable par toute l'application.
 */

const DEFAULT_STEPS: { id: string; title: string }[] = [
  { id: "project", title: "Projet créé" },
  { id: "version", title: "Version définie" },
  { id: "build", title: "Build produit" },
  { id: "prepare", title: "Préparation release" },
  { id: "publish", title: "Publication" },
];

export function buildCopilotPlan(
  ctx: CopilotRuleContext,
  rules: CopilotRule[] = COPILOT_RULES,
): CopilotPlan {
  // 1) Exécute toutes les règles.
  const recs: CopilotRecommendation[] = [];
  for (const rule of rules) {
    const out = rule.evaluate(ctx);
    if (!out) continue;
    if (Array.isArray(out)) recs.push(...out);
    else recs.push(out);
  }
  recs.sort((a, b) => a.priority - b.priority);

  // 2) Étape logique (timeline) : à partir des `completedStepId` remontés
  //    par les règles success + le contexte projet/history.
  const completedIds = new Set(
    recs.filter((r) => r.completedStepId).map((r) => r.completedStepId as string),
  );
  const blockingStep = firstBlockedStep(recs);
  const steps: CopilotStep[] = DEFAULT_STEPS.map((s, idx) => {
    let status: CopilotStepStatus = "upcoming";
    if (completedIds.has(s.id)) status = "done";
    // Étape « prepare » est done si publish est done.
    if (s.id === "prepare" && completedIds.has("publish")) status = "done";
    if (status !== "done") {
      // La 1ʳᵉ étape non « done » devient "current" ou "blocked".
      const firstPending = DEFAULT_STEPS.findIndex(
        (x, i) => i >= 0 && !completedIds.has(x.id) && !(x.id === "prepare" && completedIds.has("publish")),
      );
      if (idx === firstPending) {
        status = blockingStep === s.id ? "blocked" : "current";
      }
    }
    return { id: s.id, title: s.title, status };
  });

  // 3) Statut global — s'aligne sur ProjectStatusService quand présent.
  const status: CopilotStatus =
    ctx.status?.level === "blocked" || recs.some((r) => r.kind === "blocking")
      ? "blocked"
      : ctx.status?.level === "attention" || recs.some((r) => r.kind === "warning")
        ? "attention"
        : "ready";

  // 4) Score : base 100, pénalise blocages et warnings.
  const blockingCount = recs.filter((r) => r.kind === "blocking").length;
  const warningCount = recs.filter((r) => r.kind === "warning").length;
  const score = clamp(100 - blockingCount * 20 - warningCount * 6, 0, 100);

  // 5) Prochaine meilleure action — 1ʳᵉ recommandation actionnable.
  const nextRec = recs.find((r) => r.action);
  const nextAction: CopilotAction =
    nextRec?.action ??
    (ctx.project
      ? {
          title: "Tout est prêt",
          description:
            "Aucune action urgente. Vous pouvez rédiger de nouvelles notes ou surveiller votre historique.",
          route: "/history",
          priority: "low",
        }
      : {
          title: "Ajouter un projet",
          description: "Créez la fiche de votre première application.",
          route: "/projects",
          priority: "high",
        });

  // 6) Insights / warnings / completed
  const insights: CopilotInsight[] = recs
    .filter((r) => r.kind === "information" || r.kind === "success")
    .map(toInsight);
  const warnings: CopilotInsight[] = recs
    .filter((r) => r.kind === "warning" || r.kind === "blocking")
    .map(toInsight);
  const completed = recs
    .filter((r) => r.kind === "success")
    .map((r) => r.headline);

  // 7) Résumé humain (répond à : que se passe-t-il ? pourquoi ?)
  const headline =
    status === "blocked"
      ? recs.find((r) => r.kind === "blocking")?.headline ?? "Action requise"
      : status === "attention"
        ? recs.find((r) => r.kind === "warning")?.headline ?? "Quelques points à surveiller"
        : ctx.project
          ? `${ctx.project.name} est en bonne santé`
          : "Bienvenue sur AppPublisher";
  const summary = buildSummary(status, blockingCount, warningCount, ctx);

  // 8) ETA publication — base 6 min + pénalités douces.
  const etaMinutes = 6 + blockingCount * 4 + warningCount * 1;

  // 9) Signature stable (utile comme dépendance de rerender / clef de cache).
  const signature = [
    ctx.project?.id ?? "no-project",
    ctx.project?.updatedAt ?? "",
    ctx.project?.currentVersion ?? "",
    ctx.project?.currentBuild ?? "",
    ctx.history.length,
    ctx.history[0]?.createdAt ?? "",
    ctx.backups.length,
    ctx.backups[0]?.createdAt ?? "",
    ctx.checks.length,
    recs.length,
    score,
    status,
  ].join("|");

  return {
    overallStatus: status,
    score,
    headline,
    summary,
    nextAction,
    steps,
    insights,
    warnings,
    completed,
    etaMinutes,
    signature,
  };
}

function firstBlockedStep(recs: CopilotRecommendation[]): string | null {
  const blocker = recs.find((r) => r.kind === "blocking");
  if (!blocker) return null;
  if (blocker.id.startsWith("identity.")) return "project";
  if (blocker.id.startsWith("configuration.")) return "version";
  if (blocker.id.startsWith("build.")) return "build";
  return null;
}

function toInsight(r: CopilotRecommendation): CopilotInsight {
  return {
    id: r.id,
    kind: r.kind,
    title: r.headline,
    description: r.description,
    route: r.action?.route,
  };
}

function buildSummary(
  status: CopilotStatus,
  blocking: number,
  warning: number,
  ctx: CopilotRuleContext,
): string {
  if (!ctx.project) {
    return "Ajoutez votre premier projet pour qu'AppPublisher commence à vous accompagner.";
  }
  if (status === "blocked") {
    return blocking > 1
      ? `${blocking} points bloquent la publication.`
      : "Un point bloque la publication. Corrigez-le pour continuer.";
  }
  if (status === "attention") {
    return warning > 1
      ? `${warning} points sont à surveiller avant votre prochaine release.`
      : "Un point est à surveiller avant votre prochaine release.";
  }
  return "Votre application est saine. Vous pouvez publier en toute confiance.";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
