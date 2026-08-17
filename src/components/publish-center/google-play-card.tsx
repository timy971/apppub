import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
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
import { JourneyProgress } from "@/core/navigation/journey-progress";
import { googlePlayLaunchProgress } from "@/core/google-play/launch-plan";
import type { Project, PublishRecord } from "@/core/types";
import { GooglePlaySetupGuide } from "./google-play-setup-guide";
import { GooglePlayJourney } from "./google-play-journey";
import { GooglePlayLaunchAssistant } from "./google-play-launch-assistant";
import { HelpRequestButton } from "@/components/help-request-button";

interface Props {
  project: Project;
  release?: PublishRecord;
  onChanged: () => void;
}

type BusyAction = "oauth" | "import" | "test" | "publish" | "disconnect" | null;
type GooglePlayFailure = {
  errorCode: string;
  errorHint?: string;
  phase?: string;
  causeCode?: string;
};

export function GooglePlayCard({ project, release, onChanged }: Props) {
  const settings = useSettings();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastFailure, setLastFailure] = useState<GooglePlayFailure | null>(null);
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
  const history = HistoryService.list();
  const successfulGooglePlayReleases = history.filter(
    (record) =>
      record.projectId === project.id &&
      record.outcome === "success" &&
      record.storeRelease?.provider === "google-play",
  );
  const hasPreviousGooglePlayRelease = successfulGooglePlayReleases.length > 0;
  const alreadyPublished =
    android.googlePlayLastKnownBuild === project.currentBuild ||
    successfulGooglePlayReleases.some(
      (record) =>
        record.version === project.currentVersion &&
        record.build === project.currentBuild &&
        record.storeRelease?.track === "internal",
    );
  const publicLaunch = googlePlayLaunchProgress(android.googlePlayLaunchPlan);

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
    setLastFailure(null);
    try {
      const result = await bridge().googlePlay.connectOAuth({
        projectPath: project.localPath,
        packageName,
      });
      if (!result.ok) {
        if (result.errorCode !== "cancelled") reportGooglePlayError(result);
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
      reportGooglePlayError({
        errorCode: "network-error",
        errorHint: "La connexion avec Google a échoué. Vérifiez Internet, puis réessayez.",
      });
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
    setLastFailure(null);
    try {
      const result = await bridge().googlePlay.importServiceAccount({
        projectPath: project.localPath,
        packageName,
      });
      if (!result.ok) {
        if (result.errorCode !== "cancelled") reportGooglePlayError(result);
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
        description: "La clé privée est conservée dans le stockage sécurisé du système.",
      });
      onChanged();
    } catch {
      reportGooglePlayError({
        errorCode: "credentials-invalid",
        errorHint: "Le compte de service n’a pas pu être importé.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function testConnection() {
    if (!connectionArgs) return;
    const confirmsFirstManualRelease = initializationRequired;
    setBusy("test");
    setLastFailure(null);
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
        reportGooglePlayError(result);
        return;
      }
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayLastCheckedAt: new Date().toISOString(),
          googlePlayAccountEmail: result.accountEmail,
          googlePlayAuthMode: result.authMode,
          googlePlaySetupStatus: "ready",
          googlePlayLastKnownBuild: confirmsFirstManualRelease
            ? project.currentBuild
            : android.googlePlayLastKnownBuild,
          defaultTrack: "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Connexion Google Play vérifiée", {
        description: `${packageName} est accessible avec les droits du compte connecté.`,
      });
      onChanged();
    } catch {
      reportGooglePlayError({
        errorCode: "network-error",
        errorHint: "La vérification a été interrompue. Votre connexion Google reste enregistrée.",
      });
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
      setLastFailure(null);
      toast.success("Google Play déconnecté");
      onChanged();
    } catch {
      toast.error("Impossible de déconnecter Google Play.");
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!connectionArgs || !release?.artifactPath) return;
    if (!release.notes?.trim()) {
      toast.error("Notes de version manquantes", {
        description: "Préparez de nouveau la publication avec des notes avant l'envoi.",
      });
      return;
    }
    setBusy("publish");
    setLastFailure(null);
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
          reportGooglePlayError(result);
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
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, { googlePlayLastKnownBuild: result.versionCode }),
      );
      AppStore.refreshProjects();
      toast.success("Publication envoyée à Google Play", {
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
      reportGooglePlayError({
        errorCode: "network-error",
        errorHint: "L’envoi a été interrompu. Vérifiez Play Console avant de réessayer.",
        phase: "upload-bundle",
      });
    } finally {
      setBusy(null);
    }
  }

  function reportGooglePlayError(result: GooglePlayFailure) {
    setLastFailure(result);
    showGooglePlayError(result);
  }

  const unavailableReason = !packageName
    ? "Renseignez d'abord l'identifiant Android de l'application."
    : connected && alreadyPublished
      ? "Cette version a déjà été envoyée. Préparez un nouveau numéro de version pour republier."
      : connected && !verified
        ? "Vérifiez l'accès au compte Google avant l'envoi."
        : connected && !release
          ? "Créez puis préparez le fichier Android avant l'envoi."
          : connected && !release?.notes
            ? "Ajoutez les notes de version puis préparez de nouveau la publication."
            : undefined;

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
              <Badge variant="outline">Test interne : étape automatique</Badge>
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
                : "AppPublisher envoie d’abord une version de test sûre, puis vous accompagne jusqu’à la demande de publication publique."}
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
                disabled={busy !== null || !verified || !release?.notes || alreadyPublished}
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
      <GooglePlayJourney
        connected={connected}
        applicationReady={verified}
        artifactReady={!!release?.artifactPath && !!release.notes}
        sent={alreadyPublished}
        initializationRequired={initializationRequired}
        hasPreviousRelease={hasPreviousGooglePlayRelease}
        publicTasksDone={publicLaunch.completed}
        publicTasksTotal={publicLaunch.total}
        publicLaunchComplete={publicLaunch.complete}
      />
      {lastFailure && (
        <GooglePlayRecovery
          failure={lastFailure}
          onRetry={lastFailure.phase === "upload-bundle" ? publish : testConnection}
        />
      )}
      {unavailableReason && busy === null && (
        <p className="mt-3 text-xs text-muted-foreground">{unavailableReason}</p>
      )}
      {!release && (
        <div className="mt-4 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Vous pouvez vérifier la connexion dès maintenant. L'envoi sera disponible après la
          création et la préparation du fichier Android.
        </div>
      )}
      {initializationRequired && (
        <GooglePlaySetupGuide
          projectName={project.name}
          packageName={packageName}
          aabPath={release?.artifactPath}
          verifying={busy === "test"}
          onVerify={testConnection}
        />
      )}
      {connected && (
        <GooglePlayLaunchAssistant
          project={project}
          packageName={packageName}
          internalReleaseReady={alreadyPublished}
          onChanged={onChanged}
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
                  conservée dans le stockage sécurisé du système.
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
      <CommonGooglePlayBlockers />
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
          ? "Numéro interne déjà utilisé"
          : result.errorCode === "upload-key-mismatch"
            ? "Clé de signature non reconnue"
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

function GooglePlayRecovery({
  failure,
  onRetry,
}: {
  failure: GooglePlayFailure;
  onRetry: () => void;
}) {
  const recovery = googlePlayRecoveryFor(failure);

  async function openPlayConsole() {
    try {
      const opened = await bridge().shell.openExternal("https://play.google.com/console/");
      if (!opened) toast.error("Impossible d’ouvrir Google Play Console");
    } catch {
      toast.error("Impossible d’ouvrir Google Play Console");
    }
  }

  return (
    <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{recovery.title}</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{recovery.explanation}</p>
          <p className="mt-2 font-medium">Ce qu’il faut faire</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{recovery.solution}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recovery.action === "version" && (
              <Button asChild size="sm">
                <Link to="/version" onClick={() => JourneyProgress.rememberReturnTo("/publish")}>
                  Augmenter le numéro interne
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {recovery.action === "build" && (
              <Button asChild size="sm">
                <Link to="/build" onClick={() => JourneyProgress.rememberReturnTo("/publish")}>
                  Recréer le fichier Android
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {recovery.action === "signing" && (
              <Button asChild size="sm">
                <Link to="/signing" onClick={() => JourneyProgress.rememberReturnTo("/publish")}>
                  Choisir la bonne signature
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {recovery.action === "console" && (
              <Button size="sm" onClick={() => void openPlayConsole()}>
                Ouvrir Play Console
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
            {recovery.action === "retry" && (
              <Button size="sm" onClick={onRetry}>
                Réessayer
              </Button>
            )}
            <HelpRequestButton
              error={{
                title: recovery.title,
                explanation: recovery.explanation,
                solution: recovery.solution,
                retryable: recovery.action === "retry",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function googlePlayRecoveryFor(failure: GooglePlayFailure): {
  title: string;
  explanation: string;
  solution: string;
  action?: "version" | "build" | "signing" | "console" | "retry";
} {
  switch (failure.errorCode) {
    case "app-not-found":
      return {
        title: "L’application n’existe pas encore dans Play Console",
        explanation:
          "Le compte Google est connecté, mais Google ne trouve aucune application portant cet identifiant Android.",
        solution:
          "Suivez l’assistant de première publication ci-dessous, puis revenez vérifier l’accès.",
        action: "console",
      };
    case "permission-denied":
      return {
        title: "Le compte est connecté, mais il n’a pas les droits nécessaires",
        explanation:
          "La connexion Internet fonctionne. Google refuse l’accès de ce compte à cette application.",
        solution:
          "Dans Play Console, ouvrez Utilisateurs et autorisations, puis donnez au compte affiché l’accès à l’application et aux versions de test.",
        action: "console",
      };
    case "version-already-used":
      return {
        title: "Ce numéro interne existe déjà chez Google",
        explanation:
          "Un versionCode ne peut être utilisé qu’une seule fois, même si l’ancienne version a été supprimée ou refusée.",
        solution:
          "Augmentez le numéro interne, recréez le fichier Android, puis revenez l’envoyer. Ne changez pas seulement le nom visible de la version.",
        action: "version",
      };
    case "aab-invalid":
    case "aab-read-failed":
    case "aab-identity-mismatch":
      return {
        title: "Le fichier Android ne correspond pas à cette publication",
        explanation:
          failure.errorHint ??
          "Son identifiant, sa version, son numéro interne ou sa signature ne correspond pas au projet actif.",
        solution:
          "Recréez le fichier depuis l’étape Créer le fichier Android, sans réutiliser un ancien fichier.",
        action: "build",
      };
    case "upload-key-mismatch":
      return {
        title: "Google ne reconnaît pas la clé de signature",
        explanation:
          "Le fichier Android a été signé avec une autre clé que celle enregistrée comme clé d’importation dans Play Console.",
        solution:
          "Choisissez la signature déjà reconnue par Google, puis recréez le fichier Android. Ne créez pas une nouvelle clé pour une mise à jour.",
        action: "signing",
      };
    case "commit-outcome-unknown":
      return {
        title: "Google a peut-être accepté la version",
        explanation:
          "La connexion a été coupée pendant la confirmation finale. Un nouvel essai immédiat risquerait d’utiliser deux fois le même numéro.",
        solution: "Ouvrez Play Console et vérifiez le test interne avant toute nouvelle tentative.",
        action: "console",
      };
    case "credentials-missing":
    case "credentials-rejected":
      return {
        title: "L’autorisation Google n’est plus valable",
        explanation:
          failure.errorHint ?? "AppPublisher ne peut plus utiliser le compte enregistré.",
        solution:
          "Déconnectez Google Play, reconnectez le bon compte, puis vérifiez de nouveau l’accès.",
      };
    case "network-timeout":
    case "network-error":
      return {
        title: "La communication avec Google a été interrompue",
        explanation: failure.errorHint ?? "La connexion Google enregistrée n’a pas été supprimée.",
        solution:
          failure.phase === "upload-bundle"
            ? "Vérifiez d’abord le test interne dans Play Console. Si la version n’y apparaît pas, vous pourrez réessayer."
            : "Vérifiez votre accès Internet, puis relancez uniquement cette vérification.",
        action: failure.phase === "upload-bundle" ? "console" : "retry",
      };
    default:
      return {
        title: "Google Play a refusé l’opération",
        explanation: failure.errorHint ?? "AppPublisher n’a pas reçu de réponse exploitable.",
        solution:
          "Consultez le détail ci-dessus, vérifiez Play Console, puis réessayez uniquement après avoir identifié le point bloquant.",
        action: "console",
      };
  }
}

function CommonGooglePlayBlockers() {
  return (
    <Accordion type="single" collapsible className="mt-5 border-t">
      <AccordionItem value="common-blockers" className="border-b-0">
        <AccordionTrigger className="py-3 text-sm text-muted-foreground hover:no-underline">
          Les quatre blocages les plus fréquents
        </AccordionTrigger>
        <AccordionContent>
          <ul className="grid gap-3 text-xs text-muted-foreground md:grid-cols-2">
            <li className="rounded-lg border bg-muted/20 p-3">
              <strong className="text-foreground">Numéro déjà utilisé.</strong> Augmentez le numéro
              interne, puis recréez l’AAB.
            </li>
            <li className="rounded-lg border bg-muted/20 p-3">
              <strong className="text-foreground">Mauvais identifiant.</strong> Le package de l’AAB
              doit être exactement celui de la fiche Play Console.
            </li>
            <li className="rounded-lg border bg-muted/20 p-3">
              <strong className="text-foreground">Mauvaise clé.</strong> Une mise à jour doit être
              signée avec la clé d’importation reconnue par Google.
            </li>
            <li className="rounded-lg border bg-muted/20 p-3">
              <strong className="text-foreground">Droits insuffisants.</strong> Le compte connecté
              doit avoir accès à l’application et aux versions de test.
            </li>
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
