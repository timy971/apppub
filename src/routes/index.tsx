import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  GitBranch,
  Hammer,
  Rocket,
  HeartPulse,
  History as HistoryIcon,
  Settings as SettingsIcon,
  FolderPlus,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  useSettings,
  useActiveProject,
  useProjects,
} from "@/core/store/app-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopilotCard } from "@/components/copilot-card";
import { HealthScoreCard } from "@/components/health-score-card";
import { DiagnosticService } from "@/core/diagnostic/service";
import { HealthScoreService } from "@/core/health/service";
import { CopilotService } from "@/core/copilot/service";
import { HistoryService } from "@/core/history/service";
import type { CopilotSuggestion, HealthCheck, HealthScore } from "@/core/types";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

function Dashboard() {
  const settings = useSettings();
  const activeProject = useActiveProject();
  const projects = useProjects();
  const navigate = useNavigate();

  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [scoreState, setScoreState] = useState<HealthScore | null>(null);
  const [suggestion, setSuggestion] = useState<CopilotSuggestion | null>(null);
  const [etaMinutes, setEtaMinutes] = useState<number | undefined>();

  useEffect(() => {
    if (!settings.onboardingCompleted) {
      navigate({ to: "/setup" });
    }
  }, [settings.onboardingCompleted, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await DiagnosticService.run(activeProject);
      if (cancelled) return;
      const s = HealthScoreService.from(c);
      const history = HistoryService.list();
      const sug = CopilotService.suggest({ project: activeProject, checks: c, history });
      setChecks(c);
      setScoreState(s);
      setSuggestion(sug);
      setEtaMinutes(CopilotService.estimatePublishMinutes(c));
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProject?.id]);

  const greeting = useMemo(() => hello(settings.userName), [settings.userName]);

  if (!settings.onboardingCompleted) return null;

  return (
    <div>
      <PageHeader
        title={greeting}
        subtitle="Voici l'état de votre projet et la prochaine action à effectuer."
        help={{
          title: "À propos du tableau de bord",
          content: (
            <>
              Le copilote analyse en permanence votre projet et vous propose la
              prochaine action pertinente. Vous restez maître à bord : rien
              n'est effectué sans votre validation.
            </>
          ),
        }}
      />

      {activeProject ? (
        <>
          <Card className="mb-6 p-6 shadow-soft">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-3xl">
                  {activeProject.logoEmoji ?? "📱"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Projet actuel
                  </div>
                  <div className="text-2xl font-semibold truncate">{activeProject.name}</div>
                </div>
              </div>
              <div className="flex items-center gap-8 pr-2">
                <Stat label="Version" value={activeProject.currentVersion} />
                <Stat label="Build" value={String(activeProject.currentBuild)} />
              </div>
            </div>
          </Card>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            {suggestion && <CopilotCard suggestion={suggestion} etaMinutes={etaMinutes} />}
            {scoreState && <HealthScoreCard score={scoreState} />}
          </div>
        </>
      ) : (
        <Card className="mb-8 p-6 shadow-soft">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">Aucun projet actif</div>
              <div className="text-sm text-muted-foreground mt-1">
                {projects.length === 0
                  ? "Ajoutez votre premier projet pour commencer."
                  : "Sélectionnez un projet depuis la page Projets."}
              </div>
            </div>
            <Button asChild>
              <Link to="/projects">
                <FolderPlus className="h-4 w-4" />
                {projects.length === 0 ? "Ajouter un projet" : "Voir les projets"}
              </Link>
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-3 text-sm font-medium text-muted-foreground">Actions rapides</div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ActionCard to="/version" icon={GitBranch} title="Modifier la version" desc="Correction, nouveauté ou grande version." />
        <ActionCard to="/build" icon={Hammer} title="Construire Android" desc="Fabriquer le fichier prêt à publier." />
        <ActionCard to="/publish" icon={Rocket} title="Préparer la publication" desc="Enchaîner toutes les vérifications." />
        <ActionCard to="/diagnostic" icon={HeartPulse} title="Vérifier le projet" desc="Contrôler que tout est bien configuré." />
        <ActionCard to="/history" icon={HistoryIcon} title="Historique" desc="Retrouver toutes vos publications." />
        <ActionCard to="/settings" icon={SettingsIcon} title="Paramètres" desc="Nom, thème, mode, préférences." />
      </div>
    </div>
  );
}

function hello(name: string): string {
  const first = name || "vous";
  const hour = new Date().getHours();
  if (hour < 6) return `Bonne nuit ${first}`;
  if (hour < 12) return `Bonjour ${first}`;
  if (hour < 18) return `Bon après-midi ${first}`;
  return `Bonsoir ${first}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-xl border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated"
    >
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-base font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{desc}</div>
    </Link>
  );
}
