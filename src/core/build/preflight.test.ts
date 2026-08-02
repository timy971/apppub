import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  profileGet: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    fs: {
      exists: vi.fn().mockResolvedValue(true),
      findByExtension: vi.fn().mockResolvedValue([]),
    },
    system: {
      detect: vi.fn().mockResolvedValue({
        platform: "darwin",
        java: "17",
        javaHome: "/jdk",
        androidSdk: "installed",
        androidHome: "/android-sdk",
      }),
    },
    exec: {
      run: vi.fn().mockResolvedValue({ exitCode: 0 }),
    },
  }),
}));

vi.mock("@/features/android-signing/storage/profiles-store", () => ({
  ProfilesStore: { get: mocks.profileGet },
}));

vi.mock("@/features/android-signing/services/signing-validator", () => ({
  SigningValidator: { validate: mocks.validate },
}));

import { PreflightService } from "./preflight";

const project: Project = {
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
  publishing: {
    android: {
      signingProfileId: "ancien-profil",
      // Ce chemin legacy existe, mais ne doit jamais masquer la référence cassée.
      keystorePath: "/keys/cranioscan.jks",
      keystoreAlias: "cranioscan",
    },
  },
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("PreflightService — association de signature", () => {
  beforeEach(() => {
    mocks.profileGet.mockReset();
    mocks.validate.mockReset();
  });

  it("bloque un identifiant de profil introuvable sans basculer sur le chemin legacy", async () => {
    mocks.profileGet.mockReturnValue(undefined);

    const result = await PreflightService.run(project);
    const missing = result.checks.find((check) => check.id === "signing-profile-missing");

    expect(result.ok).toBe(false);
    expect(result.hasBlockers).toBe(true);
    expect(missing).toMatchObject({
      status: "error",
      fix: {
        label: "Réassocier la signature",
        kind: "open-cockpit",
        payload: { tab: "publishing", field: "android.signingProfileId" },
      },
    });
    expect(result.checks.some((check) => check.id === "keystore-exists")).toBe(false);
    expect(mocks.validate).not.toHaveBeenCalled();
  });
});
