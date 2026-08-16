import { Check, Circle, CircleAlert, FileArchive, Send, Store, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type GooglePlayJourneyState = "setup" | "connected" | "ready" | "sent";

const STATE_LABELS: Record<GooglePlayJourneyState, string> = {
  setup: "À configurer",
  connected: "Connecté",
  ready: "Prêt à envoyer",
  sent: "Envoyé",
};

export function GooglePlayJourney({
  connected,
  applicationReady,
  artifactReady,
  sent,
  initializationRequired,
  hasPreviousRelease,
}: {
  connected: boolean;
  applicationReady: boolean;
  artifactReady: boolean;
  sent: boolean;
  initializationRequired: boolean;
  hasPreviousRelease: boolean;
}) {
  const state: GooglePlayJourneyState = sent
    ? "sent"
    : connected && applicationReady && artifactReady
      ? "ready"
      : connected
        ? "connected"
        : "setup";
  const steps = [
    {
      title: "Compte Google",
      detail: connected ? "Compte autorisé enregistré" : "Connexion à effectuer",
      done: connected,
      current: !connected,
      icon: UserRound,
    },
    {
      title: "Application Play Console",
      detail: applicationReady
        ? "Application trouvée et accessible"
        : initializationRequired
          ? "Première création manuelle nécessaire"
          : "Accès à vérifier",
      done: applicationReady,
      current: connected && !applicationReady,
      icon: Store,
    },
    {
      title: "Fichier Android",
      detail: artifactReady
        ? "Fichier Android vérifié avec ses notes"
        : "Fichier Android et notes à préparer",
      done: artifactReady,
      current: applicationReady && !artifactReady,
      icon: FileArchive,
    },
    {
      title: "Test interne",
      detail: sent ? "Version envoyée" : "Envoi automatique par AppPublisher",
      done: sent,
      current: state === "ready",
      icon: Send,
    },
  ];

  return (
    <Card className="mt-5 border-dashed bg-muted/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Votre parcours Google Play</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {hasPreviousRelease
              ? "Mise à jour d’une application existante"
              : "Première publication"}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            state === "sent" && "border-success/40 bg-success/10 text-success",
            state === "ready" && "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {STATE_LABELS[state]}
        </Badge>
      </div>

      <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              aria-current={step.current ? "step" : undefined}
              className={cn(
                "rounded-xl border bg-background p-3",
                step.current && "border-primary/50 ring-1 ring-primary/15",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    step.done
                      ? "bg-success/15 text-success"
                      : step.current
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {step.done ? (
                    <Check className="h-4 w-4" />
                  ) : step.current ? (
                    <Icon className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </span>
                <span className="text-xs text-muted-foreground">Étape {index + 1}</span>
              </div>
              <p className="mt-2 text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {initializationRequired
          ? "À faire vous-même : créer la fiche et déposer le premier fichier Android dans Play Console. AppPublisher vous guide juste en dessous."
          : "AppPublisher vérifie le compte, le fichier et l’application avant d’envoyer uniquement vers les testeurs internes."}
      </div>
    </Card>
  );
}
