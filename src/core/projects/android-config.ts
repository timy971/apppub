import type { AndroidPublishingConfig, Project } from "@/core/types";

/**
 * Lit la configuration Android d'un projet en tolérant l'ancien emplacement
 * `project.keystorePath` (Phase 1/2). Toutes les nouvelles écritures doivent
 * cibler `project.publishing.android.*` via `patchAndroidConfig()`.
 */
export function getAndroidConfig(project: Project): AndroidPublishingConfig {
  const inner = project.publishing?.android ?? {};
  return {
    applicationId: inner.applicationId,
    keystorePath: inner.keystorePath ?? project.keystorePath,
    keystoreAlias: inner.keystoreAlias,
    defaultTrack: inner.defaultTrack,
    primaryLanguage: inner.primaryLanguage,
    signingProfileId: inner.signingProfileId,
  };
}

/**
 * Construit un patch partiel à appliquer via ProjectsService.update.
 * Fusionne proprement avec la configuration existante.
 */
export function patchAndroidConfig(
  project: Project,
  patch: Partial<AndroidPublishingConfig>,
): Partial<Project> {
  const nextAndroid: AndroidPublishingConfig = {
    ...(project.publishing?.android ?? {}),
    ...patch,
  };
  return {
    publishing: {
      ...(project.publishing ?? {}),
      android: nextAndroid,
    },
    // Synchronise l'ancien champ racine tant qu'il existe (compat lecture).
    keystorePath: nextAndroid.keystorePath ?? project.keystorePath,
  };
}
