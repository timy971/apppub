import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Copy, Rocket, Check, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChecklistView } from "@/components/checklist-view";
import { HealthScoreCard } from "@/components/health-score-card";
import { CopilotCard } from "@/components/copilot-card";
import { useActiveProject } from "@/core/store/app-store";
import { DiagnosticService } from "@/core/diagnostic/service";
import { HealthScoreService } from "@/core/health/service";
import { CopilotService } from "@/core/copilot/service";
import { ChecklistService } from "@/core/checklist/service";
import { ReleaseNotesService } from "@/core/release-notes/service";
import { HistoryService } from "@/core/history/service";
import type { HealthCheck, HealthScore, Checklist } from "@/core/types";
import { toast } from "sonner";

/**
 * Assistant « Préparer la publication » — orchestrateur.
 * Enchaîne : Diagnostic → Santé → Checklist intelligente → Notes → État final.
 * Aucune connexion à Google Play (prévu Phase 4).
 */
export const Route = createFileRoute("/publish")({
  component: PublishPage,
});

function PublishPage() {
  const project = useActiveProject();
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [score, setScore] = useState<HealthScore | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesFormatted, setNotesFormatted] = useState("");

  useEffect(() => {
    (async () => {
      const c = await DiagnosticService.run(project);
      setChecks(c);
      setScore(HealthScoreService.from(c));
    })();
  }, [project?.id]);

  const history = useMemo(() => HistoryService.list(), [project?.id]);
  const suggestion = useMemo(
    () => CopilotService.suggest({ project, checks, history }),
    [project, checks, history],
  );
  const checklist: Checklist = useMemo(
    () => ChecklistService.publish({ project, checks, history, notes: notesFormatted }),
    [project, checks, history, notesFormatted],
  );

  useEffect(() => {
    setNotesFormatted(ReleaseNotesService.format(notesDraft));
  }, [notesDraft]);

  const notesHistory = useMemo(
    () => (project ? ReleaseNotesService.historyFor(project.id) : []),
    [project?.id],
  );

  if (!project) {
    return (
      <div>
        <PageHeader title="Préparer la publication" />
        <Card className="p-8 text-center shadow-soft">
          <div className="text-lg font-semibold">Aucun projet actif</div>
          <Button asChild className="mt-4">
            <Link to="/projects">Aller aux projets</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Préparer la publication"
        subtitle={`Vérifications automatiques et mise en forme des notes pour « ${project.name} ».`}
        help={{
          title: "À propos de la préparation",
          content:
            "Cet assistant vérifie tout ce qui est nécessaire avant d'envoyer votre application sur Google Play. Il ne publie encore rien : la connexion à Google Play est prévue dans une phase future.",
        }}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <CopilotCard suggestion={suggestion} />
        {score && <HealthScoreCard score={score} />}
      </div>

      <div className="mb-6">
        <ChecklistView checklist={checklist} />
      </div>

      <Card className="mb-6 p-6 shadow-soft">
        <div className="mb-4">
          <div className="text-sm font-medium text-muted-foreground">Notes de version</div>
          <div className="text-lg font-semibold">Décrivez brièvement les nouveautés</div>
        </div>
        <Textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={5}
          placeholder="Exemples :&#10;Nouveau tableau de suivi&#10;Correction d'un bug sur l'affichage des mesures"
        />
        {notesFormatted && (
          <div className="mt-4 rounded-lg border bg-muted/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Prêt pour Google Play
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(notesFormatted);
                    toast.success("Notes copiées");
                  } catch {
                    toast.error("Impossible de copier automatiquement");
                  }
                }}
              >
                <Copy className="h-4 w-4" />
                Copier
              </Button>
            </div>
            <pre className="whitespace-pre-wrap text-sm">{notesFormatted}</pre>
            <div className="mt-2 text-xs text-muted-foreground">
              {notesFormatted.length}/500 caractères
            </div>
          </div>
        )}
        {notesHistory.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Notes précédentes
            </div>
            <ul className="space-y-2 text-sm">
              {notesHistory.slice(0, 3).map((n, i) => (
                <li key={i} className="rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">
                    v{n.version} · {new Date(n.createdAt).toLocaleDateString("fr-FR")}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{n.notes}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card
        className={
          "p-6 shadow-soft " +
          (checklist.readyToPublish ? "border-success/40 bg-success/5" : "")
        }
      >
        <div className="flex items-start gap-4">
          <div
            className={
              "flex h-12 w-12 items-center justify-center rounded-full " +
              (checklist.readyToPublish
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground")
            }
          >
            {checklist.readyToPublish ? <Check className="h-6 w-6" /> : <Rocket className="h-6 w-6" />}
          </div>
          <div className="flex-1">
            <div className="text-lg font-semibold">
              {checklist.readyToPublish
                ? "Votre application est prête à être publiée sur Google Play."
                : "Quelques points restent à finaliser."}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {checklist.readyToPublish
                ? "L'envoi automatique à Google Play sera disponible dans une phase future. En attendant, votre fichier .aab et vos notes sont prêts."
                : "Corrigez les éléments listés ci-dessus, puis revenez ici."}
            </div>
            {checklist.readyToPublish && (
              <div className="mt-4 flex gap-2">
                <Button asChild>
                  <Link to="/build">
                    Voir le dernier build
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
