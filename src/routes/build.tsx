import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useActiveProject } from "@/core/store/app-store";
import { BuildCenter } from "@/components/build-center/build-center";

export const Route = createFileRoute("/build")({
  component: BuildPage,
});

function BuildPage() {
  const project = useActiveProject();

  if (!project) {
    return (
      <div>
        <PageHeader title="Build Center" />
        <Card className="p-8 text-center shadow-soft">
          <div className="text-lg font-semibold">Aucun projet actif</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Sélectionnez un projet pour ouvrir le Build Center.
          </p>
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
        title="Build Center"
        subtitle="Suivez la construction de votre application en temps réel."
        help={{
          title: "À propos du Build Center",
          content:
            "Chaque étape est expliquée et minutée. Vous pouvez annuler à tout moment, consulter la console, et retrouver l'artefact produit à la fin.",
        }}
      />
      <BuildCenter project={project} />
    </div>
  );
}
