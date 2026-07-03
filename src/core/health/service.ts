import type { HealthCheck, HealthScore } from "@/core/types";

/**
 * HealthScoreService — produit un score global à partir des HealthCheck.
 * Le calcul est déterministe et testable, sans dépendre du runtime.
 */
export const HealthScoreService = {
  from(checks: HealthCheck[]): HealthScore {
    if (checks.length === 0) {
      return {
        score: 0,
        grade: "warning",
        passed: 0,
        total: 0,
        summary: "Aucun contrôle n'a pu être effectué.",
        highlights: [],
      };
    }

    let earned = 0;
    let possible = 0;
    let hasError = false;

    for (const c of checks) {
      const w = c.weight ?? 1;
      possible += w;
      if (c.status === "ok") earned += w;
      else if (c.status === "warning") earned += w * 0.4;
      if (c.status === "error") hasError = true;
    }
    const score = Math.round((earned / possible) * 100);

    const grade: HealthScore["grade"] = hasError
      ? "blocked"
      : score >= 90
        ? "excellent"
        : score >= 70
          ? "good"
          : "warning";

    const passed = checks.filter((c) => c.status === "ok").length;
    const highlights = checks
      .filter((c) => c.status !== "ok")
      .slice(0, 3)
      .map((c) => ({ label: c.label, status: c.status, detail: c.detail }));

    const summary = summaryFor(grade, checks.length, passed);
    return { score, grade, passed, total: checks.length, summary, highlights };
  },
};

function summaryFor(grade: HealthScore["grade"], total: number, passed: number): string {
  switch (grade) {
    case "excellent":
      return "Tout est prêt. Vous pouvez publier en toute sérénité.";
    case "good":
      return `Presque tout est prêt (${passed}/${total} contrôles au vert).`;
    case "warning":
      return "Quelques points méritent votre attention avant de publier.";
    case "blocked":
      return "Une action est nécessaire avant de pouvoir publier.";
  }
}
