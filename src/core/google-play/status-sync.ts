import { bridge } from "@/core/bridge";
import type { GooglePlayTrackState } from "@/core/bridge/types";
import type { Project } from "@/core/types";
import { patchAndroidConfig } from "@/core/projects/android-config";
import { ProjectsService } from "@/core/projects/service";
import { resolvePublicationApplicationId } from "@/core/publication/intent";

const SYNC_TTL_MS = 15 * 60 * 1000;
const LIVE_STATUSES = new Set(["completed", "inProgress"]);

function latestReleaseStatus(production: GooglePlayTrackState | undefined): {
  status: "draft" | "inProgress" | "halted" | "completed" | "unknown";
  live: boolean;
} {
  const releases = production?.releases ?? [];
  const ranked = releases
    .map((release) => ({
      release,
      maxVersion: release.versionCodes.length ? Math.max(...release.versionCodes) : 0,
    }))
    .sort((a, b) => b.maxVersion - a.maxVersion);
  const latest = ranked[0]?.release;
  const status =
    latest?.status === "draft" ||
    latest?.status === "inProgress" ||
    latest?.status === "halted" ||
    latest?.status === "completed"
      ? latest.status
      : "unknown";
  return {
    status,
    live:
      Boolean(latest?.versionCodes.length) &&
      typeof latest?.status === "string" &&
      LIVE_STATUSES.has(latest.status),
  };
}

export function applyGooglePlayStatus(
  project: Project,
  tracks: GooglePlayTrackState[],
): Project | undefined {
  const production = tracks.find((track) => track.track === "production");
  const { status, live } = latestReleaseStatus(production);
  const allCodes = tracks.flatMap((track) => track.versionCodes);
  const highestKnownBuild = allCodes.length ? Math.max(...allCodes) : undefined;
  const availability = production?.countryAvailability;
  const currentAndroid = project.publishing?.android ?? {};

  const patch = patchAndroidConfig(project, {
    googlePlayProductionStatus: status,
    googlePlayProductionVersionCodes: production?.versionCodes ?? [],
    googlePlayProductionCountries: availability?.countries ?? [],
    googlePlayProductionRestOfWorld: availability?.restOfWorld ?? false,
    googlePlayStatusSyncedAt: new Date().toISOString(),
    googlePlayLastKnownBuild:
      highestKnownBuild && highestKnownBuild > (currentAndroid.googlePlayLastKnownBuild ?? 0)
        ? highestKnownBuild
        : currentAndroid.googlePlayLastKnownBuild,
  });

  return ProjectsService.update(project.id, {
    ...patch,
    lifecycle:
      live && project.lifecycle !== "archived"
        ? "published"
        : project.lifecycle,
  });
}

export function googlePlayStatusSyncDue(project: Project, now = Date.now()): boolean {
  const android = project.publishing?.android;
  if (!android?.googlePlayConnectionId || !resolvePublicationApplicationId(project)) return false;
  const last = android.googlePlayStatusSyncedAt
    ? Date.parse(android.googlePlayStatusSyncedAt)
    : Number.NaN;
  return !Number.isFinite(last) || now - last >= SYNC_TTL_MS;
}

export async function syncGooglePlayStatus(
  project: Project,
  options: { force?: boolean } = {},
): Promise<Project | undefined> {
  if (!options.force && !googlePlayStatusSyncDue(project)) return project;
  const android = project.publishing?.android;
  const packageName = resolvePublicationApplicationId(project);
  if (!android?.googlePlayConnectionId || !packageName) return project;

  try {
    const result = await bridge().googlePlay.trackStatus({
      projectPath: project.localPath,
      packageName,
      connectionId: android.googlePlayConnectionId,
    });
    if (!result.ok) return project;
    return applyGooglePlayStatus(project, result.tracks);
  } catch {
    return project;
  }
}
