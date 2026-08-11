import { useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bridge } from "@/core/bridge";
import { HistoryService } from "@/core/history/service";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { AppStore, useSettings } from "@/core/store/app-store";
import type { Project, PublishRecord } from "@/core/types";

interface Props {
  project: Project;
  release: PublishRecord;
  onChanged: () => void;
}

type BusyAction = "import" | "test" | "publish" | "disconnect" | null;

export function GooglePlayCard({ project, release, onChanged }: Props) {
  const settings = useSettings();
  const [busy, setBusy] = useState<BusyAction>(null);
  const android = project.publishing?.android ?? {};
  const packageName = android.applicationId ?? project.packageName ?? project.playStoreAppId ?? "";
  const connectionId = android.googlePlayConnectionId;
  const connected = !!connectionId && !!android.googlePlayServiceAccountEmail;
  const verified = connected && !!android.googlePlayLastCheckedAt;
  const alreadyPublished =
    release.storeRelease?.provider === "google-play" && release.storeRelease.track === "internal";

  const connectionArgs = connectionId
    ? { projectPath: project.localPath, packageName, connectionId }
    : null;

  async function importAccount() {
    if (!packageName) {
      toast.error("Identifiant Android manquant");
      return;
    }
    setBusy("import");
    try {
      const result = await bridge().googlePlay.importServiceAccount({
        projectPath: project.localPath,
        packageName,
      });
      if (!result.ok) {
        if (result.errorCode !== "cancelled") showGooglePlayError(result);
        return;
      }
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayConnectionId: result.connectionId,
          googlePlayServiceAccountEmail: result.serviceAccountEmail,
          googlePlayCloudProjectId: result.cloudProjectId,
          googlePlayLastCheckedAt: undefined,
          defaultTrack: "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Compte de service enregistré", {
        description: "La clé privée est conservée dans le trousseau macOS.",
      });
      onChanged();
    } catch {
      toast.error("Impossible d'importer le compte de service.");
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (!connectionArgs) return;
    setBusy("test");
    try {
      const result = await bridge().googlePlay.testConnection(connectionArgs);
      if (!result.ok) {
        showGooglePlayError(result);
        return;
      }
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayLastCheckedAt: new Date().toISOString(),
          googlePlayServiceAccountEmail: result.serviceAccountEmail,
          defaultTrack: "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Connexion Google Play vérifiée", {
        description: `${packageName} est accessible avec les droits du compte de service.`,
      });
      onChanged();
    } catch {
      toast.error("La vérification Google Play a échoué.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!connectionArgs) return;
    setBusy("disconnect");
    try {
      const removed = await bridge().googlePlay.disconnect(connectionArgs);
      if (!removed) return;
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayConnectionId: undefined,
          googlePlayServiceAccountEmail: undefined,
          googlePlayCloudProjectId: undefined,
          googlePlayLastCheckedAt: undefined,
        }),
      );
      AppStore.refreshProjects();
      toast.success("Google Play déconnecté");
      onChanged();
    } catch {
      toast.error("Impossible de déconnecter Google Play.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!connectionArgs || !release.artifactPath) return;
    if (!release.notes?.trim()) {
      toast.error("Notes de version manquantes", {
        description: "Préparez de nouveau la release avec des notes avant l'envoi.",
      });
      return;
    }
    setBusy("publish");
    const started = performance.now();
    try {
      const result = await bridge().googlePlay.publishInternal({
        ...connectionArgs,
        aabPath: release.artifactPath,
        notes: release.notes,
      });
      if (!result.ok) {
        if (result.errorCode !== "cancelled") {
          try {
            HistoryService.record({
              projectId: project.id,
              projectName: project.name,
              version: project.currentVersion,
              build: project.currentBuild,
              user: settings.userName || "vous",
              durationMs: Math.round(performance.now() - started),
              outcome: "failure",
              message: `Échec Google Play : ${result.errorHint ?? result.errorCode}`,
              kind: "publish",
              artifactPath: release.artifactPath,
              artifactSizeBytes: release.artifactSizeBytes,
              notes: release.notes,
            });
          } catch {
            // Le verdict Google reste prioritaire sur un défaut d'historique local.
          }
          showGooglePlayError(result);
          onChanged();
        }
        return;
      }
      let historySaved = true;
      try {
        HistoryService.record({
          projectId: project.id,
          projectName: project.name,
          version: project.currentVersion,
          build: project.currentBuild,
          user: settings.userName || "vous",
          durationMs: Math.round(performance.now() - started),
          outcome: "success",
          message: `Publiée sur Google Play · piste internal · versionCode ${result.versionCode}`,
          kind: "publish",
          artifactPath: release.artifactPath,
          artifactSizeBytes: release.artifactSizeBytes,
          aabValidation: release.aabValidation,
          aabReportPath: release.aabReportPath,
          notes: release.notes,
          storeRelease: {
            provider: "google-play",
            track: "internal",
            packageName: result.packageName,
            versionCode: result.versionCode,
            releaseStatus: result.releaseStatus,
            editId: result.editId,
            serviceAccountEmail: result.serviceAccountEmail,
            committedAt: new Date().toISOString(),
          },
        });
      } catch {
        historySaved = false;
      }
      AppStore.refreshProjects();
      toast.success("Release envoyée à Google Play", {
        description: `${packageName} · piste internal · versionCode ${result.versionCode}`,
        duration: 10_000,
      });
      if (!historySaved) {
        toast.warning("Publication réussie, mais historique local non enregistré", {
          description:
            "Ne republiez pas cette version. Vérifiez son état dans Google Play Console.",
          duration: 15_000,
        });
      }
      onChanged();
    } catch {
      toast.error("La publication Google Play a échoué.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-primary/30 p-6 shadow-soft">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Publication Google Play</h2>
              <Badge variant="outline">Piste internal uniquement</Badge>
              {verified && (
                <Badge className="bg-success/15 text-success hover:bg-success/15">
                  Connexion vérifiée
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? android.googlePlayServiceAccountEmail
                : "Importez une clé JSON de compte de service autorisée dans Google Play Console."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              L'application doit déjà exister dans Play Console. AppPublisher ne peut ni créer la
              fiche, ni compléter les déclarations réglementaires à votre place.
            </p>
            {alreadyPublished && (
              <div className="mt-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Cette release a été envoyée sur la piste interne.
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!connected ? (
            <Button onClick={importAccount} disabled={busy !== null || !packageName}>
              {busy === "import" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Connecter Google Play
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={testConnection} disabled={busy !== null}>
                {busy === "test" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Vérifier l'accès
              </Button>
              <Button
                onClick={publish}
                disabled={busy !== null || !verified || !release.notes || alreadyPublished}
              >
                {busy === "publish" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Publier sur internal
              </Button>
              <Button
                variant="ghost"
                onClick={disconnect}
                disabled={busy !== null}
                aria-label="Déconnecter Google Play"
              >
                {busy === "disconnect" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="h-4 w-4" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function showGooglePlayError(result: { errorCode: string; errorHint?: string }) {
  const title =
    result.errorCode === "app-not-found"
      ? "Application introuvable dans Google Play"
      : result.errorCode === "permission-denied"
        ? "Droits Google Play insuffisants"
        : result.errorCode === "version-already-used"
          ? "Ce versionCode a déjà été utilisé"
          : result.errorCode === "changes-in-review"
            ? "Une modification est déjà en cours de revue"
            : result.errorCode === "commit-outcome-unknown"
              ? "Résultat de publication à vérifier"
              : result.errorCode === "credentials-missing"
                ? "Clé Google Play introuvable"
                : "Google Play a refusé l'opération";
  toast.error(title, { description: result.errorHint, duration: 12_000 });
}
