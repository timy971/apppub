import type { Project } from "@/core/types";
import { getAndroidConfig } from "@/core/projects/android-config";

export type PostVersionStep =
  | { to: "/signing"; label: "Protéger l'application" }
  | { to: "/build"; label: "Créer le fichier Android" };

export function hasLinkedSigningProfile(
  project: Project,
  availableProfileIds: readonly string[],
): boolean {
  const profileId = getAndroidConfig(project).signingProfileId;
  return Boolean(profileId && availableProfileIds.includes(profileId));
}

export function nextStepAfterVersion(
  project: Project,
  availableProfileIds: readonly string[],
): PostVersionStep {
  return hasLinkedSigningProfile(project, availableProfileIds)
    ? { to: "/build", label: "Créer le fichier Android" }
    : { to: "/signing", label: "Protéger l'application" };
}
