import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, PackageCheck, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Project } from "@/core/types";

export function PublishedUpdateCard({
  project,
  artifactReady,
}: {
  project: Project;
  artifactReady: boolean;
}) {
  const android = project.publishing?.android;
  const productionCodes = android?.googlePlayProductionVersionCodes ?? [];
  const publishedBuild = productionCodes.length
    ? Math.max(...productionCodes)
    : android?.googlePlayLastKnownBuild ?? 0;

  if (project.lifecycle !== "published" && publishedBuild <= 0) return null;

  const needsNewBuildNumber = project.currentBuild <= publishedBuild;
  const nextBuild = Math.max(project.currentBuild, publishedBuild) + 1;

  return (
    <Card className="border-success/25 bg-success/5 p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PackageCheck className="h-5 w-5 text-success" />
            <h2 className="font-semibold">Mettre à jour l’application publiée</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Google Play connaît déjà cette application. Les prochaines versions peuvent être
            préparées et envoyées directement depuis AppPublisher.
          </p>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              Production connue :{" "}
              <strong>{publishedBuild > 0 ? `build ${publishedBuild}` : "publiée"}</strong>
            </span>
            <span>
              Version locale :{" "}
              <strong>
                {project.currentVersion} ({project.currentBuild})
              </strong>
            </span>
            {artifactReady && !needsNewBuildNumber && (
              <span className="flex items-center gap-1 font-medium text-success">
                <CheckCircle2 className="h-4 w-4" />
                AAB prêt
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {needsNewBuildNumber ? (
            <Button asChild>
              <Link to="/version">
                Préparer le build {nextBuild}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          ) : !artifactReady ? (
            <Button asChild>
              <Link to="/build">
                <RefreshCw className="h-4 w-4" />
                Créer le nouvel AAB
              </Link>
            </Button>
          ) : (
            <Button
              onClick={() =>
                document
                  .getElementById("google-play-publication")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              Publier la mise à jour
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        AppPublisher vérifie ensuite le package, la signature, le numéro interne, l’AAB et les notes
        avant l’envoi à Google Play.
      </p>
    </Card>
  );
}
