import { requireCurrentArtifactSource } from "@/core/projects/release-source";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { bridge } from "@/core/bridge";
import type { GooglePlayTrack } from "@/core/bridge/types";
import { HistoryService } from "@/core/history/service";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { resolvePublicationApplicationId } from "@/core/publication/intent";
import { AppStore, useSettings } from "@/core/store/app-store";
import { JourneyProgress } from "@/core/navigation/journey-progress";
import { invalidateGooglePlayVerification } from "@/core/google-play/status-sync";
import type { Project, PublishRecord } from "@/core/types";
import { GooglePlaySetupGuide } from "./google-play-setup-guide";
import { GooglePlayJourney } from "./google-play-journey";
import { HelpRequestButton } from "@/components/help-request-button";

interface Props {
  project: Project;
  release?: PublishRecord;
  onChanged: () => void;
  externalFailure?: GooglePlayFailure | null;
}

type BusyAction = "oauth" | "reuse" | "import" | "test" | "publish" | "disconnect" | null;

type ReusableGooglePlayConnection = {
  connectionId: string;
  accountEmail: string;
  authMode: "oauth" | "service-account";
  sourceProjectName: string;
};
export type GooglePlayFailure = {
  errorCode: string;
  errorHint?: string;
  phase?: string;
  causeCode?: string;
};

const TRACK_LABELS: Record<GooglePlayTrack, string> = {
  internal: "Test interne",
  alpha: "Test fermé",
  beta: "Test ouvert",
  production: "Production",
};

const TRACK_ACTIONS: Record<GooglePlayTrack, string> = {
  internal: "Envoyer en test interne",
  alpha: "Envoyer en test fermé",
  beta: "Envoyer en test ouvert",
  production: "Publier en production",
};

const TRACK_DESCRIPTIONS: Record<GooglePlayTrack, string> = {
  internal: "Pour vérifier rapidement la version avec un petit groupe de testeurs.",
  alpha: "Pour une bêta privée avec des testeurs que vous choisissez.",
  beta: "Pour une bêta publique que des utilisateurs peuvent rejoindre.",
  production: "Pour rendre cette version disponible aux utilisateurs selon votre diffusion Google Play.",
};

export function GooglePlayCard({ project, release, onChanged, externalFailure }: Props) {
  const settings = useSettings();
  const [busy, setBusy] = useState<BusyAction>(null);
  const [lastFailure, setLastFailure] = useState<GooglePlayFailure | null>(null);
  const activeFailure = externalFailure ?? lastFailure;
  const [oauthAvailable, setOauthAvailable] = useState<boolean | null>(null);
  const [reusableConnections, setReusableConnections] = useState<ReusableGooglePlayConnection[]>([]);
  const android = project.publishing?.android ?? {};
  const packageName = resolvePublicationApplicationId(project) ?? "";
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
  const knownGooglePlayBuilds = [
    android.googlePlayLastKnownBuild ?? 0,
    ...successfulGooglePlayReleases.map((record) => record.build),
  ].filter((build) => Number.isSafeInteger(build) && build > 0);
  const highestKnownGooglePlayBuild = Math.max(0, ...knownGooglePlayBuilds);
  const suggestedNextGooglePlayBuild =
    Math.max(project.currentBuild, highestKnownGooglePlayBuild) + 1;
  const buildTooLow =
    highestKnownGooglePlayBuild > 0 && project.currentBuild < highestKnownGooglePlayBuild;
  const alreadyPublished =
    android.googlePlayLastKnownBuild === project.currentBuild ||
    successfulGooglePlayReleases.some(
      (record) =>
        record.version === project.currentVersion &&
        record.build === project.currentBuild,
    );

  const selectedTrack: GooglePlayTrack = android.defaultTrack ?? "internal";
  const accountKindKnown =
    !!android.googlePlayAccountKind && android.googlePlayAccountKind !== "unknown";
  const productionReady =
    accountKindKnown &&
    android.googlePlayDeveloperVerification === "verified" &&
    android.googlePlayPackageRegistration === "registered" &&
    (android.googlePlayAccountKind !== "personal-new" ||
      (android.googlePlayClosedTestingStatus === "completed" &&
        android.googlePlayProductionAccess === "granted"));
  const openTestingBlocked =
    android.googlePlayAccountKind === "personal-new" &&
    android.googlePlayProductionAccess !== "granted";
  const selectedTrackBlockedReason =
    selectedTrack === "production" && !productionReady
      ? "La production reste bloquée tant que les prérequis Google Play ne sont pas validés."
      : selectedTrack === "beta" && openTestingBlocked
        ? "Google n'autorise pas encore le test ouvert pour ce compte. Obtenez d'abord l'accès à la production."
        : undefined;

  function selectTrack(track: GooglePlayTrack) {
    ProjectsService.update(project.id, patchAndroidConfig(project, { defaultTrack: track }), {
      touched: ["android.defaultTrack"],
    });
    AppStore.refreshProjects();
  }

  function updatePlayCompliance(
    patch: Parameters<typeof patchAndroidConfig>[1],
    touched: string[],
  ) {
    ProjectsService.update(project.id, patchAndroidConfig(project, patch), { touched });
    AppStore.refreshProjects();
  }

  async function openPlayConsole() {
    try {
      const opened = await bridge().shell.openExternal("https://play.google.com/console/");
      if (!opened) toast.error("Impossible d’ouvrir Google Play Console");
    } catch {
      toast.error("Impossible d’ouvrir Google Play Console");
    }
  }

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

  useEffect(() => {
    if (connected || !packageName) {
      setReusableConnections([]);
      return;
    }
    let active = true;
    void bridge()
      .googlePlay.reusableConnections({
        projectPath: project.localPath,
        packageName,
      })
      .then((connections) => {
        if (active) setReusableConnections(connections);
      })
      .catch(() => {
        if (active) setReusableConnections([]);
      });
    return () => {
      active = false;
    };
  }, [connected, packageName, project.localPath]);

  async function reuseExistingConnection(candidate: ReusableGooglePlayConnection) {
    if (!packageName) return;
    setBusy("reuse");
    setLastFailure(null);
    try {
      const result = await bridge().googlePlay.reuseConnection({
        projectPath: project.localPath,
        packageName,
        connectionId: candidate.connectionId,
      });
      if (!result.ok) {
        reportGooglePlayError(result);
        setReusableConnections((current) =>
          current.filter((connection) => connection.connectionId !== candidate.connectionId),
        );
        return;
      }
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayConnectionId: result.connectionId,
          googlePlayAccountEmail: result.accountEmail,
          googlePlayAuthMode: result.authMode,
          googlePlayServiceAccountEmail:
            result.authMode === "service-account" ? result.accountEmail : undefined,
          googlePlayCloudProjectId: undefined,
          googlePlayLastCheckedAt: new Date().toISOString(),
          googlePlaySetupStatus: "ready",
          defaultTrack: android.defaultTrack ?? "internal",
        }),
      );
      AppStore.refreshProjects();
      setReusableConnections([]);
      toast.success("Compte Google Play réutilisé", {
        description: `${result.accountEmail} a accès à ${packageName}. Aucune nouvelle autorisation n'a été créée.`,
      });
      onChanged();
    } catch {
      reportGooglePlayError({
        errorCode: "network-error",
        errorHint: "AppPublisher n’a pas pu vérifier le compte Google Play déjà enregistré.",
      });
    } finally {
      setBusy(null);
    }
  }

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
          defaultTrack: android.defaultTrack ?? "internal",
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

  async function reconnectWithGoogle() {
    if (!packageName) return;
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
          defaultTrack: android.defaultTrack ?? "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Autorisation Google renouvelée", {
        description: result.initializationRequired
          ? "Le compte est reconnecté. Finalisez maintenant l'initialisation dans Play Console."
          : `${result.accountEmail} peut de nouveau accéder à ${packageName}.`,
      });
      onChanged();
    } catch {
      reportGooglePlayError({
        errorCode: "network-error",
        errorHint: "La reconnexion avec Google a échoué. Réessayez lorsque la connexion est stable.",
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
          defaultTrack: android.defaultTrack ?? "internal",
        }),
      );
      AppStore.refreshProjects();
      toast.success("Compte de service enregistré", {
        description: "La clé privée est conservée dans le trousseau macOS.",
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
          defaultTrack: android.defaultTrack ?? "internal",
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

    if (!verified) {
      try {
        const access = await bridge().googlePlay.testConnection(connectionArgs);
        if (!access.ok) {
          if (access.errorCode === "app-not-found") {
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
          reportGooglePlayError(access);
          setBusy(null);
          return;
        }
        ProjectsService.update(
          project.id,
          patchAndroidConfig(project, {
            googlePlayLastCheckedAt: new Date().toISOString(),
            googlePlayAccountEmail: access.accountEmail,
            googlePlayAuthMode: access.authMode,
            googlePlaySetupStatus: "ready",
            defaultTrack: android.defaultTrack ?? "internal",
          }),
        );
        AppStore.refreshProjects();
      } catch {
        reportGooglePlayError({
          errorCode: "network-error",
          errorHint:
            "AppPublisher n’a pas pu vérifier l’accès Google Play avant l’envoi. Votre connexion reste enregistrée.",
          phase: "pre-publish-check",
        });
        setBusy(null);
        return;
      }
    }

    try {
      await requireCurrentArtifactSource(project, release.sourceCommit);
    } catch (error) {
      toast.error("Code source à vérifier avant l’envoi", {
        description: error instanceof Error ? error.message : String(error),
        duration: 15_000,
      });
      setBusy(null);
      return;
    }
    try {
      const result = await bridge().googlePlay.publishTrack({
        ...connectionArgs,
        aabPath: release.artifactPath,
        track: selectedTrack,
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
              publicationManifestPath: release.publicationManifestPath,
              notes: release.notes,
            });
          } catch {
            // Le verdict Google reste prioritaire sur un défaut d'historique local.
          }
          if (result.errorCode === "version-already-used") {
            const rejectedBuild = Math.max(
              project.currentBuild,
              android.googlePlayLastKnownBuild ?? 0,
            );
            ProjectsService.update(
              project.id,
              patchAndroidConfig(project, { googlePlayLastKnownBuild: rejectedBuild }),
            );
          }
          reportGooglePlayError(result);
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
          message: `Publiée sur Google Play · ${TRACK_LABELS[result.track]} · versionCode ${result.versionCode}`,
          kind: "publish",
          artifactPath: release.artifactPath,
          artifactSizeBytes: release.artifactSizeBytes,
          aabValidation: release.aabValidation,
          aabReportPath: release.aabReportPath,
          publicationManifestPath: release.publicationManifestPath,
          sourceCommit: release.sourceCommit,
          sourceDirty: release.sourceDirty,
          notes: release.notes,
          storeRelease: {
            provider: "google-play",
            track: result.track,
            packageName: result.packageName,
            versionCode: result.versionCode,
            releaseStatus: result.releaseStatus,
            editId: result.editId,
            accountEmail: result.accountEmail,
            authMode: result.authMode,
            committedAt: result.committedAt ?? new Date().toISOString(),
          },
        });
      } catch {
        historySaved = false;
      }
      AppStore.refreshProjects();
      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, {
          googlePlayLastKnownBuild: result.versionCode,
          defaultTrack: result.track,
        }),
      );
      AppStore.refreshProjects();
      toast.success(
        result.recoveredCommit
          ? "Publication déjà acceptée par Google Play"
          : result.resumed
            ? "Publication reprise et terminée"
            : "Publication envoyée à Google Play",
        {
          description: `${packageName} · ${TRACK_LABELS[result.track]} · versionCode ${result.versionCode}`,
          duration: 10_000,
        },
      );
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
    if (
      connectionId &&
      (result.errorCode === "credentials-missing" || result.errorCode === "credentials-rejected")
    ) {
      invalidateGooglePlayVerification(connectionId);
      AppStore.refreshProjects();
    }
    setLastFailure(result);
    showGooglePlayError(result);
  }

  const unavailableReason = selectedTrackBlockedReason
    ? selectedTrackBlockedReason
    : !packageName
    ? "Renseignez d'abord l'identifiant Android de l'application."
    : connected && buildTooLow
      ? `Le numéro interne ${project.currentBuild} est inférieur au dernier numéro connu (${highestKnownGooglePlayBuild}). Utilisez au moins ${suggestedNextGooglePlayBuild}.`
      : connected && alreadyPublished
        ? "Cette version a déjà été envoyée. Augmentez uniquement le numéro interne pour republier."
        : connected && initializationRequired
          ? "Terminez d’abord l’initialisation de l’application dans Play Console."
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
              <Badge variant="outline">Destination : {TRACK_LABELS[selectedTrack]}</Badge>
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
            {!connected && reusableConnections.length > 0 && (
              <p className="mt-2 text-xs text-success">
                Compte déjà autorisé via « {reusableConnections[0].sourceProjectName} » :{" "}
                {reusableConnections[0].accountEmail}. AppPublisher a vérifié qu’il peut aussi
                accéder à cette application.
              </p>
            )}
            {alreadyPublished && (
              <div className="mt-3 flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Cette version a déjà été envoyée sur Google Play.
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {!connected ? (
            reusableConnections.length > 0 ? (
              <>
                <Button
                  onClick={() => reuseExistingConnection(reusableConnections[0])}
                  disabled={busy !== null || !packageName}
                >
                  {busy === "reuse" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserRound className="h-4 w-4" />
                  )}
                  Utiliser le compte déjà connecté
                </Button>
                <Button
                  variant="outline"
                  onClick={connectWithGoogle}
                  disabled={busy !== null || !packageName}
                >
                  Utiliser un autre compte
                </Button>
              </>
            ) : (
              <Button onClick={connectWithGoogle} disabled={busy !== null || !packageName}>
                {busy === "oauth" || oauthAvailable === null ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
                Se connecter avec Google
              </Button>
            )
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
                disabled={
                  busy !== null ||
                  initializationRequired ||
                  !release?.notes ||
                  alreadyPublished ||
                  buildTooLow ||
                  !!selectedTrackBlockedReason
                }
              >
                {busy === "publish" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {TRACK_ACTIONS[selectedTrack]}
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
      <div className="mt-5 rounded-xl border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="text-sm font-medium" htmlFor="google-play-target-track">
              Où voulez-vous envoyer cette version ?
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              {TRACK_DESCRIPTIONS[selectedTrack]}
            </p>
          </div>
          <Select
            value={selectedTrack}
            onValueChange={(value) => selectTrack(value as GooglePlayTrack)}
            disabled={busy !== null}
          >
            <SelectTrigger id="google-play-target-track" className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Test interne</SelectItem>
              <SelectItem value="alpha">Test fermé</SelectItem>
              <SelectItem value="beta">Test ouvert</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {!connected && (
          <p className="mt-3 text-xs text-muted-foreground">
            Vous pouvez choisir la destination maintenant. La connexion Google Play sera vérifiée
            avant l’envoi.
          </p>
        )}
        {selectedTrackBlockedReason && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">
            {selectedTrackBlockedReason}
          </p>
        )}
        {selectedTrack === "production" && productionReady && (
          <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
            Cette destination peut rendre la version accessible à de vrais utilisateurs. Une
            confirmation native supplémentaire sera demandée avant l'envoi.
          </p>
        )}
      </div>

      {selectedTrack === "production" && (
        <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-medium">Éligibilité Google Play — Production</h3>
                <Badge
                  variant="outline"
                  className={
                    productionReady
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-amber-400/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  }
                >
                  {productionReady ? "Prêt pour la production" : "Prérequis à compléter"}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                AppPublisher bloque seulement l’envoi tant qu’un prérequis obligatoire manque.
                Confirmez ici les états affichés dans votre Play Console.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void openPlayConsole()}>
              Ouvrir Play Console
            </Button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_260px] sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  {accountKindKnown ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <p className="text-sm font-medium">Type de compte développeur</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nécessaire pour savoir si le test fermé obligatoire s’applique.
                </p>
              </div>
              <Select
                value={android.googlePlayAccountKind ?? "unknown"}
                onValueChange={(value) =>
                  updatePlayCompliance(
                    {
                      googlePlayAccountKind:
                        value as NonNullable<typeof android.googlePlayAccountKind>,
                    },
                    ["android.googlePlayAccountKind"],
                  )
                }
              >
                <SelectTrigger aria-label="Type de compte développeur Google Play">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">À confirmer</SelectItem>
                  <SelectItem value="organization">Organisation</SelectItem>
                  <SelectItem value="personal-established">
                    Personnel créé avant le 13/11/2023
                  </SelectItem>
                  <SelectItem value="personal-new">
                    Personnel créé après le 13/11/2023
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_260px] sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  {android.googlePlayDeveloperVerification === "verified" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <p className="text-sm font-medium">Compte développeur vérifié</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Vérification d’identité / organisation terminée dans Play Console.
                </p>
              </div>
              <Select
                value={android.googlePlayDeveloperVerification ?? "unknown"}
                onValueChange={(value) =>
                  updatePlayCompliance(
                    {
                      googlePlayDeveloperVerification:
                        value as NonNullable<typeof android.googlePlayDeveloperVerification>,
                    },
                    ["android.googlePlayDeveloperVerification"],
                  )
                }
              >
                <SelectTrigger aria-label="Vérification développeur Google Play">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">À confirmer</SelectItem>
                  <SelectItem value="pending">En cours</SelectItem>
                  <SelectItem value="verified">Vérifiée</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_260px] sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  {android.googlePlayPackageRegistration === "registered" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  )}
                  <p className="text-sm font-medium">Package Android enregistré</p>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Le package de cette application est enregistré dans Play Console.
                </p>
              </div>
              <Select
                value={android.googlePlayPackageRegistration ?? "unknown"}
                onValueChange={(value) =>
                  updatePlayCompliance(
                    {
                      googlePlayPackageRegistration:
                        value as NonNullable<typeof android.googlePlayPackageRegistration>,
                    },
                    ["android.googlePlayPackageRegistration"],
                  )
                }
              >
                <SelectTrigger aria-label="Enregistrement du package Google Play">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unknown">À confirmer</SelectItem>
                  <SelectItem value="pending">En cours</SelectItem>
                  <SelectItem value="registered">Enregistré</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {android.googlePlayAccountKind === "personal-new" && (
              <>
                <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_260px] sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {android.googlePlayClosedTestingStatus === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      )}
                      <p className="text-sm font-medium">Test fermé obligatoire terminé</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Au moins 12 testeurs inscrits en continu pendant 14 jours.
                    </p>
                  </div>
                  <Select
                    value={android.googlePlayClosedTestingStatus ?? "unknown"}
                    onValueChange={(value) =>
                      updatePlayCompliance(
                        {
                          googlePlayClosedTestingStatus:
                            value as NonNullable<typeof android.googlePlayClosedTestingStatus>,
                        },
                        ["android.googlePlayClosedTestingStatus"],
                      )
                    }
                  >
                    <SelectTrigger aria-label="État du test fermé Google Play">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">À confirmer</SelectItem>
                      <SelectItem value="pending">En cours — 12 testeurs / 14 jours</SelectItem>
                      <SelectItem value="completed">Terminé — 12 testeurs / 14 jours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 rounded-lg border bg-background p-3 sm:grid-cols-[1fr_260px] sm:items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      {android.googlePlayProductionAccess === "granted" ? (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      )}
                      <p className="text-sm font-medium">Accès production accordé par Google</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Après le test fermé, la demande d’accès production doit être acceptée.
                    </p>
                  </div>
                  <Select
                    value={android.googlePlayProductionAccess ?? "unknown"}
                    onValueChange={(value) =>
                      updatePlayCompliance(
                        {
                          googlePlayProductionAccess:
                            value as NonNullable<typeof android.googlePlayProductionAccess>,
                        },
                        ["android.googlePlayProductionAccess"],
                      )
                    }
                  >
                    <SelectTrigger aria-label="Accès production Google Play">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unknown">À confirmer</SelectItem>
                      <SelectItem value="requested">Demande envoyée</SelectItem>
                      <SelectItem value="granted">Accès accordé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {!productionReady && (
            <p className="mt-4 text-xs font-medium text-amber-700 dark:text-amber-300">
              Action suivante : complétez le premier élément non validé ci-dessus. Dès que tous les
              prérequis obligatoires sont validés, AppPublisher autorisera l’envoi en production.
            </p>
          )}
        </div>
      )}

      <GooglePlayJourney
        connected={connected}
        applicationReady={verified}
        artifactReady={!!release?.artifactPath && !!release.notes}
        sent={alreadyPublished}
        initializationRequired={initializationRequired}
        hasPreviousRelease={hasPreviousGooglePlayRelease}
        targetTrack={selectedTrack}
      />
      {buildTooLow && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-400/40 bg-amber-50/70 p-4 text-sm dark:bg-amber-950/20"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Le numéro interne est trop petit pour Google Play</p>
              <p className="mt-1 leading-relaxed text-muted-foreground">
                Ce fichier utilise le numéro interne <strong>{project.currentBuild}</strong>, alors
                qu’AppPublisher connaît déjà le numéro{" "}
                <strong>{highestKnownGooglePlayBuild}</strong>. Google Play exige un numéro
                strictement supérieur pour chaque nouveau fichier.
              </p>
              <p className="mt-2 leading-relaxed">
                Vous pouvez garder la version visible <strong>{project.currentVersion}</strong> et
                changer uniquement le numéro interne. AppPublisher recommande{" "}
                <strong>{suggestedNextGooglePlayBuild}</strong>.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/version" onClick={() => JourneyProgress.rememberReturnTo("/publish")}>
                  Passer au numéro interne {suggestedNextGooglePlayBuild}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      {activeFailure && (
        <GooglePlayRecovery
          failure={activeFailure}
          suggestedBuild={suggestedNextGooglePlayBuild}
          onRetry={
            activeFailure.errorCode === "credentials-missing" ||
            activeFailure.errorCode === "credentials-rejected"
              ? reconnectWithGoogle
              : activeFailure.errorCode === "commit-outcome-unknown" ||
                  ["pre-publish-check", "upload-bundle", "update-track", "validate-edit", "commit-edit"].includes(
                    activeFailure.phase ?? "",
                  )
                ? publish
                : testConnection
          }
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
  suggestedBuild,
  onRetry,
}: {
  failure: GooglePlayFailure;
  suggestedBuild?: number;
  onRetry: () => void;
}) {
  const recovery = googlePlayRecoveryFor(failure, suggestedBuild);

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
                  {suggestedBuild
                    ? `Utiliser le numéro interne ${suggestedBuild}`
                    : "Augmenter le numéro interne"}
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
                {failure.errorCode === "credentials-missing" ||
                failure.errorCode === "credentials-rejected"
                  ? "Reconnecter Google"
                  : "Réessayer"}
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

function googlePlayRecoveryFor(
  failure: GooglePlayFailure,
  suggestedBuild?: number,
): {
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
    case "app-draft":
      return {
        title: "L’application est encore en brouillon dans Google Play",
        explanation:
          "Google accepte le fichier, mais refuse de créer une release active tant que l’application elle-même est encore au statut brouillon dans Play Console.",
        solution:
          "Ouvrez Play Console et terminez les éléments de configuration encore signalés comme requis pour cette application. Une fois l’application sortie de l’état brouillon, revenez dans AppPublisher et cliquez sur Réessayer. Ne recréez pas l’AAB.",
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
        explanation: suggestedBuild
          ? `Google vient de refuser ce fichier parce que son numéro interne est déjà utilisé. AppPublisher propose maintenant le numéro ${suggestedBuild}. La version visible de l’application n’a pas besoin de changer.`
          : "Google vient de refuser ce fichier parce que son numéro interne est déjà utilisé. La version visible de l’application n’a pas besoin de changer.",
        solution: suggestedBuild
          ? `Gardez la version visible si vous le souhaitez et passez uniquement le numéro interne à ${suggestedBuild}. Recréez ensuite le fichier Android puis revenez l’envoyer.`
          : "Gardez la version visible si vous le souhaitez, augmentez uniquement le numéro interne, recréez le fichier Android puis revenez l’envoyer.",
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
        title: "La confirmation finale a été interrompue",
        explanation:
          "L’AAB a déjà été envoyé. Google a peut-être aussi validé la publication avant la coupure.",
        solution:
          "Cliquez sur Réessayer. AppPublisher vérifiera d’abord si Google a déjà accepté cette version et ne renverra pas l’AAB inutilement.",
        action: "retry",
      };
    case "credentials-missing":
    case "credentials-rejected":
      return {
        title: "L’autorisation Google n’est plus valable",
        explanation:
          failure.errorHint ?? "AppPublisher ne peut plus utiliser le compte enregistré.",
        solution:
          "Reconnectez le compte Google. AppPublisher remplacera l’autorisation expirée sans modifier votre application ni vos publications.",
        action: "retry",
      };
    case "network-timeout":
    case "network-error": {
      const publicationPhase = ["pre-publish-check", "upload-bundle", "update-track", "validate-edit", "commit-edit"].includes(
        failure.phase ?? "",
      );
      return {
        title: "La communication avec Google a été interrompue",
        explanation: failure.errorHint ?? "La connexion Google enregistrée n’a pas été supprimée.",
        solution: publicationPhase
          ? "Réessayez l’envoi. AppPublisher reprendra les étapes déjà validées lorsqu’il peut les vérifier."
          : "Vérifiez votre accès Internet, puis relancez la vérification.",
        action: "retry",
      };
    }
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
