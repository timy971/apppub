import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, RefreshCw } from "lucide-react";
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
import { StepPurpose } from "@/components/step-purpose";
import { JourneyContinuation } from "@/components/journey-continuation";
import { HelpRequestButton } from "@/components/help-request-button";

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
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    if (!project) return;
    setRunning(true);
    setError(null);
    try {
      const c = await DiagnosticService.run(project);
      setChecks(c);
      setScore(HealthScoreService.from(c));
    } catch (reason) {
      setChecks([]);
      setScore(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "AppPublisher n'a pas pu terminer la vérification.",
      );
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
        title="Vérifier l'application"
        subtitle={
          project
            ? `AppPublisher contrôle automatiquement « ${project.name} » et explique chaque action nécessaire.`
            : "Ajoutez une application pour lancer sa vérification."
        }
        help={{
          title: "Comprendre la vérification",
          content: (
            <>
              🟢 Tout va bien · 🟠 Attention, action recommandée · 🔴 Problème bloquant. Chaque
              alerte est accompagnée d'une explication en français.
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

      <StepPurpose
        automatic="contrôler votre ordinateur et la configuration de l'application."
        yourAction="ouvrir la première alerte et suivre la solution proposée."
        result="vous savez exactement si la création du fichier peut commencer."
      />

      {!project && (
        <Card className="mb-6 p-8 text-center shadow-soft">
          <div className="text-lg font-semibold">Ajoutez d'abord votre application</div>
          <p className="mt-2 text-sm text-muted-foreground">
            AppPublisher pourra ensuite vérifier automatiquement ce qui est prêt.
          </p>
          <Button asChild className="mt-4">
            <Link to="/projects">Ajouter une application</Link>
          </Button>
        </Card>
      )}

      {error && (
        <Card role="alert" className="mb-6 border-danger/40 p-5 shadow-soft">
          <div className="font-semibold">Vérification interrompue</div>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh} disabled={running}>
              Réessayer
            </Button>
            <HelpRequestButton />
          </div>
        </Card>
      )}

      {project && running && checks.length === 0 && (
        <Card
          className="mb-6 flex items-center gap-3 p-5 shadow-soft"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
          <div>
            <div className="font-medium">Vérification en cours</div>
            <p className="text-sm text-muted-foreground">
              AppPublisher contrôle votre ordinateur et votre application.
            </p>
          </div>
        </Card>
      )}

      {project && !running && !error && checks.length === 0 && (
        <Card className="mb-6 p-5 shadow-soft">
          <div className="font-medium">Aucun résultat disponible</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Relancez la vérification pour obtenir un résultat exploitable.
          </p>
          <Button className="mt-3" variant="outline" onClick={refresh}>
            Réessayer
          </Button>
        </Card>
      )}

      {project && score && (
        <div className="mb-6 space-y-4">
          <HealthScoreCard score={score} />
          {score.grade !== "blocked" && (
            <JourneyContinuation
              fallbackTo="/version"
              fallbackLabel="Préparer la version"
              title="Vérification terminée"
              description={
                score.grade === "warning"
                  ? "Aucun blocage n'empêche de continuer. Vous pourrez revenir sur les points d'attention plus tard."
                  : "Les contrôles essentiels sont passés. La prochaine étape consiste à préparer le numéro de version."
              }
            />
          )}
        </div>
      )}

      {project && !error && (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const items = checks.filter(
              (c) =>
                (c.category ?? "environment") === g.id &&
                (settings.mode !== "discovery" || c.status !== "ok"),
            );
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
                          {settings.mode !== "discovery" && c.why && (
                            <div className="mt-2">
                              <WhyButton title={c.label}>{c.why}</WhyButton>
                            </div>
                          )}
                          {c.status !== "ok" && recoveryFor(c) && (
                            <Button asChild size="sm" variant="outline" className="mt-3">
                              <Link to={recoveryFor(c)!.to}>
                                {recoveryFor(c)!.label}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
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
      )}
    </div>
  );
}

function recoveryFor(check: HealthCheck): { to: "/build" | "/version"; label: string } | undefined {
  if (check.id === "project-android") {
    return { to: "/build", label: "Préparer Android" };
  }
  if (check.id === "version-json" || check.id === "version-script") {
    return { to: "/version", label: "Préparer la version" };
  }
  return undefined;
}
