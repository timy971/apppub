import { useEffect, useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Unplug,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { bridge } from "@/core/bridge";
import { HistoryService } from "@/core/history/service";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { AppStore, useSettings } from "@/core/store/app-store";
import type { Project, PublishRecord } from "@/core/types";
import { GooglePlaySetupGuide } from "./google-play-setup-guide";

interface Props {
  project: Project;
  release: PublishRecord;
  onChanged: () => void;
}

type BusyAction = "oauth" | "import" | "test" | "publish" | "disconnect" | null;

export function GooglePlayCard({ project, release, onChanged }: Props) {
  const settings = useSettings();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [oauthAvailable, setOauthAvailable] = useState<boolean | null>(null);
  const android = project.publishing?.android ?? {};
  const packageName = android.applicationId ?? project.packageName ?? project.playStoreAppId ?? "";
  const connectionId = android.googlePlayConnectionId;
  const accountEmail = android.googlePlayAccountEmail ?? android.googlePlayServiceAccountEmail;
  const authMode =
    android.googlePlayAuthMode ??
    (android.googlePlayServiceAccountEmail ? "service-account" : undefined);
  const connected = !!connectionId && !!accountEmail;
  const verified = connected && !!android.googlePlayLastCheckedAt;
  const initializationRequired = connected && android.googlePlaySetupStatus === "required";
  const alreadyPublished =
    release.storeRelease?.provider === "google-play" && release.storeRelease.track === "internal";

  const connectionArgs = connectionId
    ? { projectPath: project.localPath, packageName, connectionId }
    : null;

  useEffect(() => {
    let active = true;
    void bridge()
      .googlePlay.oauthStatus()
      .then((status) => {
        if (active) setOauthAvailable(status.available);
      })
      .catch(() => {
        if (active) setOauthAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function connectWithGoogle() {
    if (!packageName) {
      toast.error("Identifiant Android manquant");
      return;
    }
    setBusy("oauth");
    try {
      const result = await bridge().googlePlay.connectOAuth({
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
          googlePlayAccountEmail: result.accountEmail,
          googlePlayAuthMode: "oauth",
          googlePlayServiceAccountEmail: undefined,
          googlePlayCloudProjectId: undefined,
          googlePlayLastCheckedAt: result.verified ? new Date().toISOString() : undefined,
          googlePlaySetupStatus: result.initializationRequired ? "required" : "ready",
          defaultTrack: "internal",
        }),
      );
      AppStore.refreshProjects();
      if (result.initializationRequired) {
        toast.warning("Compte Google connecté — application à initialiser", {
          description: "Suivez maintenant les quatre étapes affichées dans AppPublisher.",
          duration: 10_000,
        });
      } else {
        toast.success("Google Play connecté", {
          description: `${result.accountEmail} peut accéder à ${packageName}.`,
        });
      }
      onChanged();
    } catch {
      toast.error("La connexion avec Google a échoué.");
    } finally {
      setBusy(null);
    }
  }

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
          googlePlayAccountEmail: result.accountEmail,
          googlePlayAuthMode: "service-account",
          googlePlayServiceAccountEmail: result.serviceAccountEmail,
          googlePlayCloudProjectId: result.cloudProjectId,
          googlePlayLastCheckedAt: undefined,
          googlePlaySetupStatus: undefined,
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
        if (result.errorCode === "app-not-found") {
          ProjectsService.update(
            project.id,
            patchAndroidConfig(project, {
              googlePlayLastCheckedAt: undefined,
              googlePlaySetupStatus: "required",
            }),
          );
          AppStore.refreshProjects();
          onChanged();
        }
        showGooglePlayError(result);
        return;
      }
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayLastCheckedAt: new Date().toISOString(),
          googlePlayAccountEmail: result.accountEmail,
          googlePlayAuthMode: result.authMode,
          googlePlaySetupStatus: "ready",
          defaultTrack: "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Connexion Google Play vérifiée", {
        description: `${packageName} est accessible avec les droits du compte connecté.`,
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
          googlePlayAccountEmail: undefined,
          googlePlayAuthMode: undefined,
          googlePlayServiceAccountEmail: undefined,
          googlePlayCloudProjectId: undefined,
          googlePlayLastCheckedAt: undefined,
          googlePlaySetupStatus: undefined,
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
          if (result.errorCode === "app-not-found") {
            ProjectsService.update(
              project.id,
              patchAndroidConfig(project, {
                googlePlayLastCheckedAt: undefined,
                googlePlaySetupStatus: "required",
              }),
            );
            AppStore.refreshProjects();
          }
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
            accountEmail: result.accountEmail,
            authMode: result.authMode,
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
    <Card id="google-play-publication" className="border-primary/30 p-6 shadow-soft">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Publication Google Play</h2>
              <Badge variant="outline">Test interne uniquement</Badge>
              {verified && (
                <Badge className="bg-success/15 text-success hover:bg-success/15">
                  Connexion vérifiée
                </Badge>
              )}
              {initializationRequired && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-200">
                  Initialisation requise
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {connected
                ? `${accountEmail} · ${authMode === "service-account" ? "compte de service" : "compte Google"}`
                : "Connectez le compte Google autorisé dans votre Play Console."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {initializationRequired
                ? "Google demande une première création dans Play Console avant d’autoriser AppPublisher à publier."
                : "L'application doit déjà exister dans Play Console. AppPublisher ne peut ni créer la fiche, ni compléter les déclarations réglementaires à votre place."}
            </p>
            {alreadyPublished && (
              <div className="mt-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Cette version a été envoyée aux testeurs internes.
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!connected ? (
            <Button onClick={connectWithGoogle} disabled={busy !== null || !packageName}>
              {busy === "oauth" || oauthAvailable === null ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserRound className="h-4 w-4" />
              )}
              Se connecter avec Google
            </Button>
          ) : (
            <>
              {!initializationRequired && (
                <Button variant="outline" onClick={testConnection} disabled={busy !== null}>
                  {busy === "test" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Vérifier l'accès
                </Button>
              )}
              <Button
                onClick={publish}
                disabled={busy !== null || !verified || !release.notes || alreadyPublished}
              >
                {busy === "publish" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Envoyer aux testeurs internes
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
      {initializationRequired && (
        <GooglePlaySetupGuide
          projectName={project.name}
          packageName={packageName}
          aabPath={release.artifactPath}
          verifying={busy === "test"}
          onVerify={testConnection}
        />
      )}
      {!connected && (
        <Accordion type="single" collapsible className="mt-5 border-t">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger className="py-3 text-muted-foreground hover:no-underline">
              Options avancées
            </AccordionTrigger>
            <AccordionContent>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">Compte de service Google</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Réservé aux équipes et aux automatisations. Sélectionnez le fichier JSON d'un
                  compte de service déjà invité dans Google Play Console. Sa clé privée sera
                  conservée dans le trousseau macOS.
                </p>
                <Button
                  className="mt-3"
                  variant="outline"
                  onClick={importAccount}
                  disabled={busy !== null || !packageName}
                >
                  {busy === "import" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Importer une clé JSON
                </Button>
              </div>
              {oauthAvailable === false && (
                <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
                  La connexion Google doit encore être activée dans cette compilation
                  d'AppPublisher. L'import JSON reste disponible ci-dessus.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </Card>
  );
}

function showGooglePlayError(result: {
  errorCode: string;
  errorHint?: string;
  phase?: string;
  causeCode?: string;
}) {
  const title =
    result.errorCode === "app-not-found"
      ? "Application introuvable dans Google Play"
      : result.errorCode === "permission-denied"
        ? "Droits Google Play insuffisants"
        : result.errorCode === "version-already-used"
          ? "Numéro de build déjà utilisé"
          : result.errorCode === "changes-in-review"
            ? "Une modification est déjà en cours de revue"
            : result.errorCode === "commit-outcome-unknown"
              ? "Résultat de publication à vérifier"
              : result.errorCode === "oauth-not-configured"
                ? "Connexion Google à activer"
                : result.errorCode === "credentials-missing"
                  ? "Autorisation Google Play introuvable"
                  : result.errorCode === "network-timeout"
                    ? result.phase === "upload-bundle"
                      ? "Envoi du fichier Android trop long"
                      : "Google Play ne répond pas"
                    : result.errorCode === "network-error"
                      ? result.phase === "upload-bundle"
                        ? "Envoi du fichier Android interrompu"
                        : "Communication Google Play interrompue"
                      : result.errorCode === "aab-read-failed"
                        ? "Fichier Android impossible à lire"
                        : "Google Play a refusé l'opération";
  const description =
    result.errorCode === "app-not-found"
      ? "Créez la fiche, ajoutez et enregistrez le premier fichier Android dans le test interne, puis recommencez la vérification."
      : result.errorCode === "version-already-used"
        ? "Google Play n'accepte jamais deux fichiers avec le même numéro interne. Ouvrez « Préparer la version », augmentez ce numéro, recréez le fichier Android, puis republiez."
        : result.errorHint;
  toast.error(title, { description, duration: 12_000 });
}
