import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  profileGet: vi.fn(),
  validate: vi.fn(),
  exists: vi.fn(),
  inspectAndroid: vi.fn(),
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
    androidPreparation: {
      inspect: mocks.inspectAndroid,
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
    mocks.inspectAndroid.mockReset();
    mocks.exists.mockResolvedValue(true);
    mocks.inspectAndroid.mockResolvedValue({
      status: "ready",
      blockers: [],
      warnings: [],
      changes: [],
      packageManager: "npm",
      hasCapacitorConfig: true,
      hasCapacitorCore: true,
      hasCapacitorCli: true,
      hasCapacitorAndroid: true,
      hasAndroid: true,
      hasGradleWrapper: true,
      hasAndroidBuildFile: true,
      appName: "CrânioScan",
      applicationId: "app.cranioscan.android",
      webDir: "dist",
      webOutputReady: true,
    });
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
    mocks.inspectAndroid.mockResolvedValue({
      status: "preparable",
      blockers: [],
      warnings: [],
      changes: [],
      packageManager: "npm",
      hasCapacitorConfig: false,
      hasCapacitorCore: false,
      hasCapacitorCli: false,
      hasCapacitorAndroid: false,
      hasAndroid: false,
      hasGradleWrapper: false,
      hasAndroidBuildFile: false,
      appName: "CrânioScan",
      applicationId: "app.cranioscan.android",
      webDir: "dist",
      webOutputReady: false,
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

  it("accepte un android incomplet dans un projet Git géré car il sera recréé dans le workspace", async () => {
    const managedProject: Project = {
      ...project,
      source: {
        type: "git",
        remoteUrl: "https://github.com/example/victorytrack.git",
        branch: "main",
        managed: true,
      },
      detected: {
        ...project.detected,
        hasAndroid: true,
        hasGradleWrapper: false,
        androidReadiness: "blocked",
        androidReadinessReason: "Le dossier android/ existe mais il est incomplet.",
        capacitorAppId: "app.victorytrack.android",
      },
      publishing: {
        android: {
          applicationId: "app.victorytrack.android",
          signingProfileId: "signature-victory",
        },
      },
    };

    mocks.inspectAndroid.mockResolvedValue({
      status: "blocked",
      blockers: ["Le dossier android/ existe mais il est incomplet."],
      warnings: [],
      changes: [],
      packageManager: "npm",
      hasCapacitorConfig: true,
      hasCapacitorCore: true,
      hasCapacitorCli: true,
      hasCapacitorAndroid: true,
      hasAndroid: true,
      hasGradleWrapper: false,
      hasAndroidBuildFile: false,
      appName: "Victory Track",
      applicationId: "app.victorytrack.android",
      webDir: "dist",
      webOutputReady: true,
    });
    mocks.exists.mockImplementation(async (path: string) => {
      if (path === managedProject.localPath) return true;
      if (path.endsWith("/package.json")) return true;
      if (path === managedProject.localPath + "/android") return true;
      if (path.includes("build.gradle")) return false;
      if (path.includes("capacitor.config")) return true;
      return false;
    });
    mocks.profileGet.mockReturnValue({
      id: "signature-victory",
      name: "VictoryTrack",
      keystorePath: "/keys/victory.jks",
      alias: "victory",
    });
    mocks.validate.mockResolvedValue({ ok: true, message: "Signature valide." });

    const result = await PreflightService.run(managedProject);

    expect(result.ok).toBe(true);
    expect(result.checks.find((check) => check.id === "gradle-wrapper")).toMatchObject({
      status: "success",
    });
    expect(result.checks.find((check) => check.id === "build-gradle")).toMatchObject({
      status: "success",
    });
    expect(result.checks.find((check) => check.id === "android-dir")?.message).toMatch(
      /incomplet sera recréé automatiquement/,
    );
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
