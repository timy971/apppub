import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useActiveProject } from "@/core/store/app-store";
import { PublishCenter, NoProjectPublish } from "@/components/publish-center/publish-center";
import { StepPurpose } from "@/components/step-purpose";
import { ActiveApplicationContext } from "@/components/active-application-context";

/**
 * /publish — Publish Center.
 * Prépare une release puis permet son envoi explicite vers la piste Google Play choisie.
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
            "Choisissez la destination de cette version : test interne, test fermé, test ouvert ou production. AppPublisher conserve les garde-fous nécessaires avant l'envoi.",
        }}
      />
      {project ? (
        <>
          <ActiveApplicationContext project={project} />
          <StepPurpose
            automatic="vérifier le fichier, la version, les notes et la connexion Google Play."
            yourAction="relire le résumé, choisir la destination Google Play puis confirmer l'envoi."
            result="la nouvelle version apparaît dans Google Play Console sur la piste choisie."
          />
          <PublishCenter project={project} />
        </>
      ) : (
        <NoProjectPublish />
      )}
    </div>
  );
}
