import { Link } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, ListChecks, Smartphone, Store, TestTube2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bridge } from "@/core/bridge";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { AppStore } from "@/core/store/app-store";
import type { Project, PublishRecord } from "@/core/types";

const PLAY_CONSOLE_URL = "https://play.google.com/console/";

export function PostPublishCard({
  project,
  release,
  onChanged,
}: {
  project: Project;
  release: PublishRecord;
  onChanged: () => void;
}) {
  const storeRelease = release.storeRelease;
  if (!storeRelease) return null;

  const android = project.publishing?.android ?? {};
  const tested = android.googlePlayLastTestedBuild === storeRelease.versionCode;
  const committedAt = new Date(storeRelease.committedAt);
  const committedLabel = Number.isNaN(committedAt.getTime())
    ? undefined
    : committedAt.toLocaleString("fr-FR", {
        dateStyle: "medium",
        timeStyle: "short",
      });

  async function openPlayConsole() {
    try {
      const opened = await bridge().shell.openExternal(PLAY_CONSOLE_URL);
      if (!opened) toast.error("Impossible d'ouvrir Google Play Console");
    } catch {
      toast.error("Impossible d'ouvrir Google Play Console");
    }
  }

  function confirmTested() {
    if (!storeRelease) return;
    const testedAt = new Date().toISOString();
    ProjectsService.update(
      project.id,
      patchAndroidConfig(project, {
        googlePlayLastTestedBuild: storeRelease.versionCode,
        googlePlayLastTestedAt: testedAt,
      }),
    );
    AppStore.refreshProjects();
    toast.success("Version marquée comme testée", {
      description: "AppPublisher vous proposera maintenant de préparer la prochaine version.",
    });
    onChanged();
  }

  return (
    <Card
      role="status"
      className={
        tested
          ? "border-success/40 bg-success/5 p-6 shadow-soft"
          : "border-primary/40 bg-primary/5 p-6 shadow-soft"
      }
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className={
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl " +
              (tested ? "bg-success/15 text-success" : "bg-primary/15 text-primary")
            }
          >
            {tested ? <CheckCircle2 className="h-6 w-6" /> : <Store className="h-6 w-6" />}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                {tested
                  ? `Version ${release.version} (${storeRelease.versionCode}) testée`
                  : `Version ${release.version} (${storeRelease.versionCode}) envoyée à Google Play`}
              </h2>
              <Badge
                variant="outline"
                className={
                  tested
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-primary/40 bg-primary/10 text-primary"
                }
              >
                {tested ? "Test réel confirmé" : "Envoi réussi"}
              </Badge>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {tested
                ? "Vous avez confirmé que cette version a bien été installée et testée depuis Google Play."
                : "AppPublisher a terminé l’envoi vers la piste de test interne. Cela confirme l’envoi à Google Play, pas encore que la version est effectivement installable sur un téléphone."}
            </p>

            <p className="mt-2 text-xs text-muted-foreground">
              Piste : Test interne
              {committedLabel ? ` · Envoyée le ${committedLabel}` : ""}
              {storeRelease.accountEmail ? ` · ${storeRelease.accountEmail}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" onClick={openPlayConsole}>
            <ExternalLink className="h-4 w-4" />
            Ouvrir Play Console
          </Button>
          {tested ? (
            <Button asChild>
              <Link to="/version">Préparer la prochaine version</Link>
            </Button>
          ) : (
            <Button onClick={confirmTested}>
              <CheckCircle2 className="h-4 w-4" />
              J’ai testé cette version
            </Button>
          )}
        </div>
      </div>

      {!tested ? (
        <div className="mt-5 rounded-xl border bg-background/80 p-4">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">La suite, dans cet ordre</h3>
          </div>
          <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <li className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Store className="h-4 w-4 text-primary" />
                1. Vérifier Play Console
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Confirmez que la release apparaît bien sur la piste de test interne et qu’aucune
                action Google n’est demandée.
              </p>
            </li>
            <li className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4 text-primary" />
                2. Installer depuis Google Play
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Utilisez le lien de test interne et installez cette version depuis Google Play sur
                un vrai téléphone.
              </p>
            </li>
            <li className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <TestTube2 className="h-4 w-4 text-primary" />
                3. Faire un test rapide
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Vérifiez le lancement, la connexion et les fonctions principales de l’application.
              </p>
            </li>
            <li className="rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                4. Confirmer ici
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Revenez dans AppPublisher et cliquez sur « J’ai testé cette version ».
              </p>
            </li>
          </ol>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-success/30 bg-background/80 p-4">
          <p className="text-sm font-medium">Prochaine étape : préparer la version suivante</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Cette release est terminée côté AppPublisher. Lorsque vous aurez une correction ou une
            nouveauté à publier, commencez par préparer une nouvelle version ou un nouveau numéro
            interne.
          </p>
        </div>
      )}
    </Card>
  );
}
