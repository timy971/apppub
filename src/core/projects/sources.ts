import type { Project } from "@/core/types";

/**
 * Suivi de l'origine d'un champ de configuration.
 *
 * - "detected" : la valeur a été lue automatiquement dans les fichiers
 *   du projet (package.json, capacitor.config, strings.xml, build.gradle…)
 * - "user"     : la valeur a été saisie ou corrigée dans AppPublisher.
 *
 * Objectif : préparer les futures intégrations (Google Play, App Store
 * Connect, GitHub, Fastlane) qui devront savoir si la valeur affichée
 * dans AppPublisher fait autorité sur les fichiers sources ou l'inverse.
 */
export type FieldSource = "detected" | "user";

/** Clés stables — toujours en notation pointée. */
export type TrackedFieldKey =
  | "name"
  | "logoEmoji"
  | "description"
  | "notes"
  | "packageName"
  | "githubRepo"
  | "defaultBranch"
  | "currentVersion"
  | "localPath"
  | "buildCommand"
  | "android.applicationId"
  | "android.keystorePath"
  | "android.keystoreAlias"
  | "android.defaultTrack"
  | "android.primaryLanguage"
  | "ios.bundleId"
  | "ios.teamId"
  | "ios.scheme"
  | "ios.releaseConfig"
  | "ios.primaryLanguage";

export function sourceOf(
  project: Project,
  key: TrackedFieldKey,
): FieldSource | undefined {
  return project.fieldSources?.[key];
}

/** Retourne une copie du map avec les clés marquées. */
export function withSources(
  project: Project,
  updates: Partial<Record<TrackedFieldKey, FieldSource>>,
): Record<string, FieldSource> {
  return { ...(project.fieldSources ?? {}), ...updates };
}
