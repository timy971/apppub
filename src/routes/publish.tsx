import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { useActiveProject } from "@/core/store/app-store";
import { PublishCenter, NoProjectPublish } from "@/components/publish-center/publish-center";

/**
 * /publish — Publish Center.
 * Aucun accès store réel : la préparation crée une trace historique
 * et une sauvegarde. Les intégrations Google Play / App Store viendront
 * s'ajouter comme widgets sans refonte.
 */
export const Route = createFileRoute("/publish")({
  validateSearch: z.object({}).catchall(z.unknown()).parse,
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
            "Le Publish Center rassemble tout ce qui est nécessaire à la préparation d'une release : résumé, vérifications, notes, cibles et historique. L'envoi automatique vers Google Play et App Store sera disponible dans une phase future.",
        }}
      />
      {project ? <PublishCenter project={project} /> : <NoProjectPublish />}
    </div>
  );
}
