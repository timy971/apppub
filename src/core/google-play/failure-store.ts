export type StoredGooglePlayFailure = {
  errorCode: string;
  errorHint?: string;
  phase?: string;
  causeCode?: string;
  attemptedVersionCode?: number;
  existingVersionCode?: number;
  minimumVersionCode?: number;
};

function storageKey(projectId: string) {
  return `apppublisher:google-play-failure:${projectId}`;
}

export function restoreGooglePlayFailure(projectId: string): StoredGooglePlayFailure | null {
  try {
    const saved = sessionStorage.getItem(storageKey(projectId));
    if (!saved) return null;
    const failure = JSON.parse(saved) as StoredGooglePlayFailure;
    return typeof failure.errorCode === "string" ? failure : null;
  } catch {
    return null;
  }
}

export function rememberGooglePlayFailure(
  projectId: string,
  failure: StoredGooglePlayFailure,
) {
  try {
    sessionStorage.setItem(storageKey(projectId), JSON.stringify(failure));
  } catch {
    // L’alerte reste visible tant que le composant reste monté.
  }
}

export function forgetGooglePlayFailure(projectId: string) {
  try {
    sessionStorage.removeItem(storageKey(projectId));
  } catch {
    // Aucun stockage à nettoyer dans cet environnement.
  }
}

export function requiredGooglePlayVersionCode(projectId: string): number | undefined {
  const minimum = restoreGooglePlayFailure(projectId)?.minimumVersionCode;
  return Number.isSafeInteger(minimum) && minimum && minimum > 0 ? minimum : undefined;
}
