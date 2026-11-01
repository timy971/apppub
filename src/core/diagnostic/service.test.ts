import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  exists: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    fs: { exists: mocks.exists },
    system: { detect: mocks.detect },
  }),
}));

import { DiagnosticService } from "./service";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "victorytrack",
    name: "VictoryTrack",
    localPath:
      "/Users/test/Library/Application Support/AppPublisher/managed-projects/victorytrack-123",
    currentVersion: "1.2.0",
    currentBuild: 12,
    detected: {
      hasPackageJson: true,
      hasAndroid: false,
      hasIos: false,
      hasVersionJson: false,
      hasCapacitorConfig: true,
      hasVersionScript: false,
      androidReadiness: "preparable",
      capacitorAppId: "app.victorytrack.android",
    },
    source: {
      type: "git",
      remoteUrl: "https://github.com/example/victorytrack.git",
      branch: "main",
      managed: true,
    },
    publishing: {
      android: { applicationId: "app.victorytrack.android" },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("DiagnosticService — Lot 12", () => {
  beforeEach(() => {
    mocks.exists.mockReset();
    mocks.detect.mockReset();
    mocks.exists.mockResolvedValue(false);
    mocks.detect.mockResolvedValue({
      platform: "darwin",
      node: "22",
      npm: "10",
      git: "2.50",
      java: "21",
      androidStudio: "installé",
      androidSdk: "36",
      androidHome: "/Users/test/Library/Android/sdk",
      internet: true,
    });
  });

  it("does not block a managed Git project because android/version files are absent from the source", async () => {
    const checks = await DiagnosticService.run(project());

    expect(checks.find((check) => check.id === "project-android")).toMatchObject({
      status: "ok",
      detail: "Android sera préparé automatiquement dans une copie de publication propre.",
    });
    expect(checks.find((check) => check.id === "version-json")).toMatchObject({
      status: "ok",
      detail: "La version est gérée directement par AppPublisher pour la publication.",
    });
    expect(checks.find((check) => check.id === "version-script")).toMatchObject({
      status: "ok",
      detail: "Aucun script n'est requis : AppPublisher applique la version dans la copie de publication.",
    });
  });

  it("keeps the legacy warnings for an unmanaged local project", async () => {
    const local = project({
      localPath: "/Users/test/VictoryTrack",
      source: undefined,
    });
    const checks = await DiagnosticService.run(local);

    expect(checks.find((check) => check.id === "project-android")?.status).toBe("error");
    expect(checks.find((check) => check.id === "version-json")?.status).toBe("warning");
    expect(checks.find((check) => check.id === "version-script")?.status).toBe("warning");
  });
});
