import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  profileGet: vi.fn(),
  validate: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    fs: {
      exists: mocks.exists,
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
    mocks.exists.mockReset();
    mocks.exists.mockResolvedValue(true);
  });

  it("considère Android recréable comme prêt pour un projet Git géré", async () => {
    const managedProject: Project = {
      ...project,
      source: {
        type: "git",
        remoteUrl: "https://github.com/example/cranioscan.git",
        branch: "main",
        managed: true,
      },
      detected: {
        ...project.detected,
        hasAndroid: false,
        androidReadiness: "preparable",
        capacitorAppId: "app.cranioscan.android",
      },
      publishing: {
        android: {
          applicationId: "app.cranioscan.android",
          signingProfileId: "signature-cranioscan",
        },
      },
    };

    mocks.exists.mockImplementation(async (path: string) => {
      if (path === managedProject.localPath) return true;
      if (path.endsWith("/package.json")) return true;
      if (path.includes("/android")) return false;
      if (path.includes("capacitor.config")) return false;
      return false;
    });
    mocks.profileGet.mockReturnValue({
      id: "signature-cranioscan",
      name: "CrânioScan",
      keystorePath: "/keys/cranioscan.jks",
      alias: "cranioscan",
    });
    mocks.validate.mockResolvedValue({
      ok: true,
      message: "Signature valide.",
      certificate: { sha256: "AA".repeat(32) },
    });

    const result = await PreflightService.run(managedProject);

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === "android-dir")).toMatchObject({
      status: "success",
      fix: undefined,
    });
    expect(result.checks.find((check) => check.id === "gradle-wrapper")).toMatchObject({
      status: "success",
    });
    expect(result.checks.find((check) => check.id === "build-gradle")).toMatchObject({
      status: "success",
    });
    expect(result.checks.find((check) => check.id === "capacitor-config")).toMatchObject({
      status: "success",
    });
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
