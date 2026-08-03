import { bridge } from "@/core/bridge";
import { getAndroidConfig } from "@/core/projects/android-config";
import type { AabExpectedIdentity, AabValidationReport, Project } from "@/core/types";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";

function normalizedFingerprint(value?: string): string | undefined {
  const normalized = value?.replace(/[^0-9a-f]/gi, "").toUpperCase();
  return normalized || undefined;
}

export function expectedAabIdentity(project: Project): AabExpectedIdentity {
  const android = getAndroidConfig(project);
  const profile = android.signingProfileId
    ? ProfilesStore.get(android.signingProfileId)
    : undefined;
  return {
    packageName:
      project.playStoreAppId ??
      android.applicationId ??
      project.detected?.capacitorAppId ??
      project.packageName ??
      undefined,
    versionName: project.currentVersion,
    versionCode: project.currentBuild,
    signerSha256: normalizedFingerprint(profile?.certificate?.sha256),
  };
}

export const AabValidationService = {
  inspect(
    project: Project,
    aabPath: string,
    options: { persistReport?: boolean } = {},
  ): Promise<AabValidationReport> {
    return bridge().aab.inspect({
      path: aabPath,
      expected: expectedAabIdentity(project),
      persistReport: options.persistReport,
    });
  },
};
