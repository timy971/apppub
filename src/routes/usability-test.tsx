import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, Clipboard, FlaskConical, Play, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppStore } from "@/core/store/app-store";
import {
  UsabilityTestService,
  useUsabilityTestSession,
} from "@/core/usability-test/service";

export const Route = createFileRoute("/usability-test")({
  component: UsabilityTestPage,
});

function UsabilityTestPage() {
  const session = useUsabilityTestSession();
  const [alias, setAlias] = useState("");
  const navigate = useNavigate();

  function start() {
    UsabilityTestService.start(alias);
    AppStore.updateSettings({
      mode: "discovery",
      onboardingCompleted: false,
      returnToJourneyPath: undefined,
      lastJourneyPath: undefined,
    });
    toast.success("Session de test novice démarrée");
    navigate({ to: "/setup" });
  }

  function finish() {
    const completed = UsabilityTestService.finish();
    if (!completed) return;
    toast.success(
      completed.googlePlaySuccess
        ? "Test terminé — publication détectée"
        : "Test terminé — publication non détectée",
    );
  }

  async function copyReport() {
    const report = UsabilityTestService.report();
    try {
      await navigator.clipboard.writeText(report);
      toast.success("Rapport copié");
    } catch {
      toast.error("Impossible de copier le rapport");
    }
  }

  return (
    <div>
      <PageHeader
        title="Test utilisateur novice"
        subtitle="Vérifiez qu'une personne qui ne connaît ni Git, ni Gradle, ni Capacitor peut publier sans aide technique."
      />

      {!session && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="p-6 shadow-soft">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Démarrer une session</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Utilisez de préférence un Mac ou un profil utilisateur qui ne contient pas déjà les
              habitudes du développeur. Le testeur doit essayer seul. N'expliquez un bouton qu'après
              qu'il a signalé un blocage.
            </p>

            <label htmlFor="usability-tester-alias" className="mt-5 block text-sm font-medium">
              Prénom ou pseudonyme du testeur
            </label>
            <Input
              id="usability-tester-alias"
              className="mt-2 max-w-sm"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="Ex. Marie"
            />

            <Button className="mt-5" onClick={start}>
              <Play className="h-4 w-4" />
              Commencer le test
            </Button>
          </Card>

          <Card className="p-6 shadow-soft">
            <h2 className="font-semibold">Critère de réussite</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Le test est réussi si le testeur atteint une publication Google Play réelle sans
              ouvrir Terminal, Android Studio, Gradle ou les dossiers techniques d'AppPublisher.
            </p>
            <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              Une session ne supprime aucun projet, aucune clé de signature et aucun historique.
            </div>
          </Card>
        </div>
      )}

      {session?.status === "active" && (
        <Card className="p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">Session en cours · {session.testerAlias}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Laissez le testeur suivre le parcours. Les boutons « Je ne comprends pas » et « Je
                suis bloqué » restent visibles en haut de l'application.
              </p>
            </div>
            <Button variant="outline" onClick={finish}>
              <Square className="h-4 w-4" />
              Terminer le test
            </Button>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Metric
              label="Écrans visités"
              value={session.events.filter((event) => event.kind === "route").length}
            />
            <Metric
              label="Incompréhensions"
              value={session.events.filter((event) => event.kind === "confusion").length}
            />
            <Metric
              label="Blocages"
              value={session.events.filter((event) => event.kind === "blocked").length}
            />
          </div>

          <Button asChild className="mt-5">
            <Link to="/">Revenir au parcours</Link>
          </Button>
        </Card>
      )}

      {session?.status === "completed" && (
        <div className="space-y-4">
          <Card className="p-6 shadow-soft">
            <div className="flex items-start gap-3">
              <CheckCircle2
                className={
                  "mt-0.5 h-5 w-5 " +
                  (session.googlePlaySuccess ? "text-success" : "text-warning")
                }
              />
              <div>
                <h2 className="font-semibold">
                  {session.googlePlaySuccess
                    ? "Publication Google Play détectée"
                    : "Publication Google Play non confirmée"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {session.googlePlaySuccess
                    ? "Le critère principal du test est atteint. Analysez maintenant les moments d'hésitation."
                    : "Le rapport indique où le parcours s'est arrêté et quels écrans ont posé problème."}
                </p>
              </div>
            </div>

            <pre className="mt-5 whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-xs">
              {UsabilityTestService.report(session)}
            </pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void copyReport()}>
                <Clipboard className="h-4 w-4" />
                Copier le rapport
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  UsabilityTestService.clear();
                  setAlias("");
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Nouvelle session
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
