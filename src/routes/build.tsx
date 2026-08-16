import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/core/store/app-store";
import { BuildCenter } from "@/components/build-center/build-center";
import { StepPurpose } from "@/components/step-purpose";

export const Route = createFileRoute("/build")({
  component: BuildPage,
});

function BuildPage() {
  const project = useActiveProject();

  if (!project) {
    return (
      <div>
        <PageHeader title="Créer le fichier Android" />
        <Card className="p-8 text-center shadow-soft">
          <div className="text-lg font-semibold">Aucune application active</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Choisissez d'abord l'application pour laquelle vous souhaitez créer un fichier.
          </p>
          <Button asChild className="mt-4">
            <Link to="/projects">Choisir une application</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Créer le fichier Android"
        subtitle="AppPublisher vérifie les prérequis, construit l'application et vous remet le fichier à publier."
        help={{
          title: "À propos du fichier Android",
          content:
            "Google Play attend un fichier au format AAB. AppPublisher le crée, vérifie sa signature et vous indique précisément où il se trouve.",
        }}
      />
      <StepPurpose
        automatic="vérifier les outils nécessaires, préparer Android, construire puis contrôler le fichier."
        yourAction="lancer la création et laisser AppPublisher travailler."
        result="un fichier AAB signé est prêt pour Google Play."
      />
      <BuildCenter project={project} />
    </div>
  );
}
