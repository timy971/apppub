import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusDot } from "@/components/status-dot";
import { DiagnosticService } from "@/core/diagnostic/service";
import { HealthScoreService } from "@/core/health/service";
import { HealthScoreCard } from "@/components/health-score-card";
import { WhyButton } from "@/components/why-button";
import type { HealthCheck, HealthScore } from "@/core/types";
import { useActiveProject, useSettings } from "@/core/store/app-store";

export const Route = createFileRoute("/diagnostic")({
  component: DiagnosticPage,
});

const GROUPS: { id: HealthCheck["category"]; label: string }[] = [
  { id: "environment", label: "Votre ordinateur" },
  { id: "project", label: "Votre projet" },
  { id: "network", label: "Réseau" },
];

function DiagnosticPage() {
  const project = useActiveProject();
  const settings = useSettings();
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [score, setScore] = useState<HealthScore | null>(null);
  const [running, setRunning] = useState(false);

  async function refresh() {
    setRunning(true);
    try {
      const c = await DiagnosticService.run(project);
      setChecks(c);
      setScore(HealthScoreService.from(c));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  return (
    <div>
      <PageHeader
        title="Santé du projet"
        subtitle={
          project
            ? `Vérifications automatiques sur « ${project.name} ». Aucun jargon, uniquement l'essentiel.`
            : "Ajoutez un projet pour lancer une vérification."
        }
        help={{
          title: "À propos du diagnostic",
          content: (
            <>
              🟢 Tout va bien · 🟠 Attention, action recommandée · 🔴 Problème
              bloquant. Chaque alerte est accompagnée d'une explication en français.
            </>
          ),
        }}
        actions={
          <Button variant="outline" onClick={refresh} disabled={running}>
            <RefreshCw className={running ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Relancer
          </Button>
        }
      />

      {score && (
        <div className="mb-6">
          <HealthScoreCard score={score} />
        </div>
      )}

      <div className="space-y-6">
        {GROUPS.map((g) => {
          const items = checks.filter((c) => (c.category ?? "environment") === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id}>
              <div className="mb-2 text-sm font-medium text-muted-foreground">{g.label}</div>
              <div className="grid gap-3">
                {items.map((c) => (
                  <Card key={c.id} className="p-4 shadow-soft">
                    <div className="flex items-start gap-4">
                      <StatusDot status={c.status} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{c.label}</div>
                        {c.detail && (
                          <div className="mt-1 text-sm text-muted-foreground">{c.detail}</div>
                        )}
                        {(settings.mode === "discovery" || settings.mode === "expert") && c.why && (
                          <div className="mt-2">
                            <WhyButton title={c.label}>{c.why}</WhyButton>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
