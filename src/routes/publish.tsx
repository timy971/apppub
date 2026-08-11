import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { useActiveProject } from "@/core/store/app-store";
import { PublishCenter, NoProjectPublish } from "@/components/publish-center/publish-center";

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
        title="Publish Center"
        subtitle={
          project
            ? `Préparez la prochaine release de « ${project.name} ».`
            : "Centre de préparation des releases."
        }
        help={{
          title: "À propos du Publish Center",
          content:
            "Le Publish Center rassemble la préparation d'une release et son envoi sécurisé sur la piste interne Google Play. Les autres pistes et App Store Connect restent désactivés.",
        }}
      />
      {project ? <PublishCenter project={project} /> : <NoProjectPublish />}
    </div>
  );
}
