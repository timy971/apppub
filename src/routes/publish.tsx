import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useActiveProject } from "@/core/store/app-store";
import { PublishCenter, NoProjectPublish } from "@/components/publish-center/publish-center";
import { StepPurpose } from "@/components/step-purpose";
import { Card } from "@/components/ui/card";
import { Apple } from "lucide-react";

/**
 * /publish — Publish Center.
 * Prépare une release puis permet son envoi explicite sur Google Play internal.
 */
export const Route = createFileRoute("/publish")({
  component: PublishPage,
});

function PublishPage() {
  const project = useActiveProject();
  return (
    <div>
      <PageHeader
        title="Publier sur Google Play"
        subtitle={
          project
            ? `Vérifiez puis envoyez la prochaine version de « ${project.name} ». Rien ne part sans votre confirmation.`
            : "Choisissez une application pour préparer sa publication."
        }
        help={{
          title: "À propos de la publication",
          content:
            "AppPublisher commence par publier auprès de vos testeurs internes. Cette étape sûre permet de vérifier l'application avant de la proposer au public.",
        }}
      />
      {project ? (
        <>
          <StepPurpose
            automatic="vérifier le fichier, la version, les notes et la connexion Google Play."
            yourAction="relire le résumé puis confirmer l'envoi aux testeurs internes."
            result="la nouvelle version apparaît dans Google Play Console, piste Internal."
          />
          <Card
            id="apple-publication"
            className="mb-6 border-dashed p-5 shadow-soft"
            aria-labelledby="apple-publication-title"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Apple className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="apple-publication-title" className="font-semibold">
                    Publication iPhone et iPad
                  </h2>
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                    En pause
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Cette partie est prévue, mais elle reste volontairement en pause tant que vous
                  n'avez pas de compte Apple Developer. Lorsque vous souhaiterez la reprendre,
                  AppPublisher vous guidera pour préparer l'application iOS, la signer puis
                  l'envoyer vers App Store Connect.
                </p>
                <p className="mt-3 text-xs font-medium text-foreground">
                  Vous n'avez rien à configurer maintenant.
                </p>
              </div>
            </div>
          </Card>
          <PublishCenter project={project} />
        </>
      ) : (
        <NoProjectPublish />
      )}
    </div>
  );
}
