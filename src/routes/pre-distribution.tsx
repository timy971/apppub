import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Circle, FlaskConical, Rocket, ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HistoryService } from "@/core/history/service";
import { useUsabilityTestSession } from "@/core/usability-test/service";

export const Route = createFileRoute("/pre-distribution")({
  component: PreDistributionPage,
});

function PreDistributionPage() {
  const session = useUsabilityTestSession();
  const history = HistoryService.list();

  const noviceValidated =
    session?.status === "completed" && session.googlePlaySuccess === true;

  const closedTrackRelease = history.find(
    (record) =>
      record.kind === "publish" &&
      record.outcome === "success" &&
      record.storeRelease?.provider === "google-play" &&
      record.storeRelease.track === "alpha",
  );
  const closedTrackValidated = Boolean(closedTrackRelease);
  const ready = noviceValidated && closedTrackValidated;

  return (
    <div>
      <PageHeader
        title="Validation avant distribution"
        subtitle="Deux preuves terrain avant de figer AppPublisher et de lancer sa distribution macOS."
        help={{
          title: "Pourquoi cette validation ?",
          content:
            "Les tests automatisés vérifient le code. Ces deux validations vérifient que le parcours fonctionne aussi avec un vrai utilisateur et avec Google Play réel.",
        }}
      />

      <Card className="mb-4 border-primary/20 p-6 shadow-soft">
        <div className="flex items-start gap-3">
          <ShieldCheck
            className={ready ? "mt-0.5 h-6 w-6 text-success" : "mt-0.5 h-6 w-6 text-primary"}
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {ready ? "Prêt pour le Lot 13" : "Validation terrain encore nécessaire"}
              </h2>
              <Badge variant="outline">
                {ready
                  ? "2 / 2 validées"
                  : `${Number(noviceValidated) + Number(closedTrackValidated)} / 2 validées`}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {ready
                ? "Les deux validations terrain sont présentes. Vous pouvez maintenant figer l'expérience actuelle et passer à la distribution macOS."
                : "AppPublisher reste utilisable et le Quality Gate protège le code, mais ces validations réduisent fortement le risque de découvrir un problème après distribution."}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ValidationCard
          done={noviceValidated}
          icon={FlaskConical}
          title="1. Test avec un vrai novice"
          description="Une personne non technique doit aller jusqu'à une publication Google Play réelle sans Terminal, Android Studio ni aide technique."
          evidence={
            noviceValidated
              ? `Session « ${session?.testerAlias ?? "testeur"} » terminée avec publication Google Play détectée.`
              : "Aucune session novice terminée avec publication Google Play réelle n'est encore enregistrée."
          }
          action={
            <Button asChild variant={noviceValidated ? "outline" : "default"}>
              <Link to="/usability-test">
                {noviceValidated ? "Voir ou refaire le test" : "Lancer le test novice"}
              </Link>
            </Button>
          }
        />

        <ValidationCard
          done={closedTrackValidated}
          icon={Rocket}
          title="2. Promotion réelle vers le test fermé"
          description="Une version déjà envoyée en test interne doit être promue vers la piste fermée et apparaître réellement dans Google Play."
          evidence={
            closedTrackRelease
              ? `${closedTrackRelease.projectName} · version ${closedTrackRelease.version} · nº interne ${closedTrackRelease.storeRelease?.versionCode ?? closedTrackRelease.build}.`
              : "Aucune promotion réussie vers la piste de test fermé n'est encore enregistrée."
          }
          action={
            <Button asChild variant={closedTrackValidated ? "outline" : "default"}>
              <Link to="/publish">
                {closedTrackValidated ? "Voir Google Play" : "Ouvrir la publication"}
              </Link>
            </Button>
          }
        />
      </div>

      <Card className="mt-4 p-5 shadow-soft">
        <h2 className="font-semibold">Ce que cet écran ne simule pas</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Une case n'est cochée que si AppPublisher possède une preuve locale issue d'une opération
          réelle : une session novice terminée avec publication détectée, ou un historique Google
          Play réussi sur la piste fermée. Aucun bouton « marquer comme terminé » n'est proposé.
        </p>
      </Card>
    </div>
  );
}

function ValidationCard({
  done,
  icon: Icon,
  title,
  description,
  evidence,
  action,
}: {
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  evidence: string;
  action: React.ReactNode;
}) {
  return (
    <Card className="p-6 shadow-soft">
      <div className="flex items-start gap-3">
        {done ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-success" aria-hidden="true" />
        ) : (
          <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">{title}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
          <div className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {evidence}
          </div>
          <div className="mt-4">{action}</div>
        </div>
      </div>
    </Card>
  );
}
