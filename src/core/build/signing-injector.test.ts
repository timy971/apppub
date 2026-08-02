import { describe, expect, it, vi } from "vitest";
import { SigningInjector } from "./signing-injector";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";
import type { Project } from "@/core/types";

const project = (signingProfileId?: string): Project => ({
  id: "project-1",
  name: "CrânioScan",
  localPath: "/projects/cranioscan",
  currentVersion: "1.0.0",
  currentBuild: 1,
  detected: {
    hasPackageJson: true,
    hasAndroid: true,
    hasIos: false,
    hasVersionJson: true,
    hasCapacitorConfig: true,
  },
  publishing: { android: { signingProfileId } },
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
});

describe("SigningInjector.inspect", () => {
  it("identifie l'ancienne signature et l'affectation AppPublisher finale", () => {
    const content = `
      android {
        signingConfigs {
          release { storeFile file("cranioscan-release-key.keystore") }
        }
        buildTypes { release { signingConfig signingConfigs.release } }
      }
      // >>> AppPublisher managed signing config — do not edit
      android {
        signingConfigs { appPublisherRelease { storeFile file(APP_KEYSTORE_FILE) } }
        buildTypes { release { signingConfig signingConfigs.appPublisherRelease } }
      }
      // <<< AppPublisher managed signing config
    `;

    const result = SigningInjector.inspect(content);
    expect(result.legacyStoreFiles).toEqual(['"cranioscan-release-key.keystore"']);
    expect(result.releaseAssignments).toEqual(["release", "appPublisherRelease"]);
    expect(result.releaseUsesAppPublisher).toBe(true);
    expect(result.hasAppPublisherRelease).toBe(true);
  });

  it("détecte une réaffectation différée dangereuse", () => {
    const result = SigningInjector.inspect(`
      project.afterEvaluate {
        android.buildTypes.release.signingConfig signingConfigs.release
      }
    `);
    expect(result.hasDeferredSigningOverride).toBe(true);
  });
});

describe("SigningInjector.resolveProfile", () => {
  it("refuse une référence vers un profil supprimé", () => {
    const get = vi.spyOn(ProfilesStore, "get").mockReturnValue(undefined);

    const result = SigningInjector.resolveProfile(project("ancien-profil"));

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "profile-missing" }),
    });
    expect(get).toHaveBeenCalledWith("ancien-profil");
    get.mockRestore();
  });

  it("distingue un projet sans association", () => {
    const result = SigningInjector.resolveProfile(project());
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: "no-profile-linked" }),
    });
  });
});
