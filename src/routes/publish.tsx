import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useActiveProject } from "@/core/store/app-store";
import { PublishCenter, NoProjectPublish } from "@/components/publish-center/publish-center";
import { StepPurpose } from "@/components/step-purpose";

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
          <PublishCenter project={project} />
        </>
      ) : (
        <NoProjectPublish />
      )}
    </div>
  );
}
