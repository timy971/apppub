import type { Project, PublishRecord } from "@/core/types";

const ANDROID_PACKAGE_RE = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;

function validAndroidPackage(value?: string): string | undefined {
  const clean = typeof value === "string" ? value.trim() : "";
  return ANDROID_PACKAGE_RE.test(clean) ? clean : undefined;
}

/**
 * Résout l'identifiant réellement publié sur Google Play.
 *
 * Le `name` de package.json (ex: vite_react_shadcn_ts) est un nom npm et ne
 * doit jamais écraser l'appId Android détecté dans Capacitor / l'AAB.
 */
export function resolveGooglePlayPackageName(project: Project, release?: PublishRecord): string {
  const candidates = [
    project.publishing?.android?.applicationId,
    release?.aabValidation?.packageName,
    project.detected.capacitorAppId,
    project.playStoreAppId,
    project.packageName,
  ];

  for (const candidate of candidates) {
    const valid = validAndroidPackage(candidate);
    if (valid) return valid;
  }
  return "";
}
