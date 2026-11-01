import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RefreshCw, Rocket } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bridge } from "@/core/bridge";
import type { GooglePlayTrack, GooglePlayTrackState } from "@/core/bridge/types";
import { HistoryService } from "@/core/history/service";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { resolvePublicationApplicationId } from "@/core/publication/intent";
import { AppStore, useSettings } from "@/core/store/app-store";
import type { Project } from "@/core/types";

const LABELS: Record<GooglePlayTrack, string> = {
  internal: "Test interne",
  alpha: "Test fermé",
  beta: "Test ouvert",
  production: "Production",
};

const ORDER: GooglePlayTrack[] = ["internal", "alpha", "beta", "production"];

export function GooglePlayTracksCard({
  project,
  onChanged,
}: {
  project: Project;
  onChanged: () => void;
}) {
  const settings = useSettings();
  const [tracks, setTracks] = useState<GooglePlayTrackState[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState<GooglePlayTrack | null>(null);

  const android = project.publishing?.android ?? {};
  const packageName = resolvePublicationApplicationId(project) ?? "";
  const connectionId = android.googlePlayConnectionId;
  const connected = Boolean(connectionId && packageName);
  const connectionArgs =
    connected && connectionId
      ? { projectPath: project.localPath, packageName, connectionId }
      : null;

  const history = HistoryService.list();
  const sourceRelease = useMemo(
    () =>
      history.find(
        (record) =>
          record.projectId === project.id &&
          record.outcome === "success" &&
          record.storeRelease?.provider === "google-play" &&
          record.artifactPath &&
          record.notes,
      ),
    [history, project.id],
  );

  const versionCode = sourceRelease?.storeRelease?.versionCode ?? sourceRelease?.build;

  async function refresh() {
    if (!connectionArgs) return;
    setLoading(true);
    try {
      const result = await bridge().googlePlay.trackStatus(connectionArgs);
      if (!result.ok) {
        toast.error("État Google Play indisponible", {
          description: result.errorHint ?? result.errorCode,
        });
        return;
      }
      setTracks(result.tracks);
    } catch {
      toast.error("Impossible de lire les pistes Google Play");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!connectionArgs) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId, packageName, project.id]);

  if (!connected || !sourceRelease || !versionCode) return null;

  const currentTrackState = (track: GooglePlayTrack) =>
    tracks?.find((item) => item.track === track);
  const onTrack = (track: GooglePlayTrack) =>
    currentTrackState(track)?.versionCodes.includes(versionCode) ?? false;

  const productionReady =
    android.googlePlayDeveloperVerification === "verified" &&
    android.googlePlayPackageRegistration === "registered" &&
    (android.googlePlayAccountKind !== "personal-new" ||
      (android.googlePlayClosedTestingStatus === "completed" &&
        android.googlePlayProductionAccess === "granted"));

  const openTestingBlocked =
    android.googlePlayAccountKind === "personal-new" &&
    android.googlePlayProductionAccess !== "granted";

  async function promote(track: Exclude<GooglePlayTrack, "internal">) {
    const release = sourceRelease;
    const code = versionCode;
    if (!connectionArgs || !release?.artifactPath || !release.notes || !code) return;
    setPromoting(track);
    const started = performance.now();
    try {
      const result = await bridge().googlePlay.promoteVersion({
        ...connectionArgs,
        aabPath: release.artifactPath,
        versionCode: code,
        track,
        notes: release.notes,
      });
      if (!result.ok) {
        if (result.errorCode !== "cancelled") {
          toast.error("Promotion Google Play impossible", {
            description: result.errorHint ?? result.errorCode,
            duration: 12_000,
          });
        }
        return;
      }

      HistoryService.record({
        projectId: project.id,
        projectName: project.name,
        version: release.version,
        build: result.versionCode,
        user: settings.userName || "vous",
        durationMs: Math.round(performance.now() - started),
        outcome: "success",
        message: `Promue sur Google Play · ${LABELS[result.track]} · versionCode ${result.versionCode}`,
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

      ProjectsService.update(
        project.id,
        patchAndroidConfig(project, { defaultTrack: result.track }),
      );
      AppStore.refreshProjects();
      toast.success(`Version promue vers « ${LABELS[result.track]} »`);
      await refresh();
      onChanged();
    } catch {
      toast.error("La promotion Google Play a été interrompue");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <Card className="border-primary/20 p-6 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Cycle de diffusion Google Play</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Version suivie : {sourceRelease.version} · nº interne {versionCode}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Actualiser
        </Button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-4">
        {ORDER.map((track) => {
          const active = onTrack(track);
          const state = currentTrackState(track);
          return (
            <div key={track} className="rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium">{LABELS[track]}</div>
                <Badge variant="outline">{active ? "Cette version" : "—"}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {state?.versionCodes.length
                  ? `Dernier nº interne : ${state.versionCodes[0]}`
                  : loading
                    ? "Lecture…"
                    : "Aucune version détectée"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 space-y-3">
        {!onTrack("alpha") && onTrack("internal") && (
          <PromotionRow
            title="Étape suivante : test fermé"
            detail="Réutilise la version déjà envoyée sur Google Play, sans téléverser de nouveau fichier."
            action="Promouvoir vers le test fermé"
            busy={promoting === "alpha"}
            onClick={() => void promote("alpha")}
          />
        )}

        {!onTrack("beta") && onTrack("alpha") && (
          <PromotionRow
            title="Étape suivante : test ouvert"
            detail={
              openTestingBlocked
                ? "Pour un nouveau compte personnel, Google n'ouvre le test ouvert qu'après l'accord d'accès à la production."
                : "Le test ouvert rend la version de test visible aux utilisateurs qui souhaitent rejoindre le programme."
            }
            action="Promouvoir vers le test ouvert"
            busy={promoting === "beta"}
            disabled={openTestingBlocked}
            onClick={() => void promote("beta")}
          />
        )}

        {!onTrack("production") && (onTrack("alpha") || onTrack("beta")) && (
          <PromotionRow
            title="Étape suivante : production"
            detail={
              productionReady
                ? "AppPublisher demandera une confirmation explicite avant toute publication en production."
                : "La production reste bloquée tant que la conformité du compte et du package n'est pas confirmée dans le Lot 14."
            }
            action="Promouvoir vers la production"
            busy={promoting === "production"}
            disabled={!productionReady}
            onClick={() => void promote("production")}
          />
        )}

        {onTrack("production") && (
          <div className="rounded-xl border border-success/30 bg-success/5 p-4">
            <div className="font-medium text-success">Version envoyée sur la piste production</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Google Play indique que le nº interne {versionCode} est présent sur la piste production. Une revue ou une mise en attente de publication peut encore s'appliquer dans Play Console.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

function PromotionRow({
  title,
  detail,
  action,
  busy,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  action: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
      </div>
      <Button onClick={onClick} disabled={disabled || busy}>
        {busy ? "Promotion…" : action}
        {!busy && <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}
