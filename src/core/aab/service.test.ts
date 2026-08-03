import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
}));

vi.mock("@/features/android-signing/storage/profiles-store", () => ({
  ProfilesStore: { get: mocks.getProfile },
}));

import { expectedAabIdentity } from "./service";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "CrânioScan",
    localPath: "/projects/cranioscan",
    currentVersion: "2.3.0",
    currentBuild: 17,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      capacitorAppId: "app.cranioscan.android",
    },
    publishing: {
      android: {
        applicationId: "app.lovable.cranioscan.twa",
        signingProfileId: "cranioscan-release",
      },
    },
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...overrides,
  };
}

describe("expectedAabIdentity", () => {
  beforeEach(() => {
    mocks.getProfile.mockReset().mockReturnValue({
      certificate: { sha256: "AA:BB:CC:DD" },
    });
  });

  it("uses the immutable publishing applicationId instead of a stale Capacitor detection", () => {
    expect(expectedAabIdentity(project())).toEqual({
      packageName: "app.lovable.cranioscan.twa",
      versionName: "2.3.0",
      versionCode: 17,
      signerSha256: "AABBCCDD",
    });
  });

  it("falls back to the detected Capacitor appId for legacy projects", () => {
    expect(
      expectedAabIdentity(
        project({
          publishing: { android: { signingProfileId: "cranioscan-release" } },
        }),
      ).packageName,
    ).toBe("app.cranioscan.android");
  });

  it("uses the connected Play Console package as the strongest reference", () => {
    expect(
      expectedAabIdentity(
        project({ playStoreAppId: "app.play.immutable", publishing: { android: {} } }),
      ).packageName,
    ).toBe("app.play.immutable");
  });
});
