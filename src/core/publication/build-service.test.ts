const mocks = vi.hoisted(() => ({
  prepareWorkspace: vi.fn(),
  reconcileWorkspace: vi.fn(),
  releaseWorkspace: vi.fn(),
  buildCore: vi.fn(),
  promote: vi.fn(),
  inspectAndroid: vi.fn(),
  prepareAndroid: vi.fn(),
  history: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/core/publication/workspace-service", () => ({
  PublicationWorkspaceService: {
    prepare: mocks.prepareWorkspace,
    reconcile: mocks.reconcileWorkspace,
    release: mocks.releaseWorkspace,
  },
}));

vi.mock("@/core/build/service", () => ({
  BuildService: { build: mocks.buildCore },
}));

vi.mock("@/core/capacitor/service", () => ({
  CapacitorService: {
    inspect: mocks.inspectAndroid,
    prepareAndroid: mocks.prepareAndroid,
  },
}));

vi.mock("@/core/history/service", () => ({
  HistoryService: { list: mocks.history },
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { log: mocks.log },
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    publicationArtifacts: { promote: mocks.promote },
  }),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";
import { PublicationBuildService } from "./build-service";

function project(): Project {
  return {
    id: "project-1",
    name: "VictoryTrack",
    localPath: "/managed/victorytrack",
    currentVersion: "2.0.0",
    currentBuild: 8,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      hasVersionScript: true,
      hasGradleWrapper: true,
      capacitorAppId: "app.victorytrack.android",
      packageManager: "npm",
    },
    source: {
      type: "git",
      remoteUrl: "https://github.com/example/victorytrack.git",
      branch: "main",
      managed: true,
      headSha: "1".repeat(40),
      shortSha: "1".repeat(10),
      relation: "up-to-date",
      workingTree: "clean",
    },
    publishing: {
      android: {
        applicationId: "app.victorytrack.android",
        googlePlayLastKnownBuild: 9,
      },
    },
    createdAt: "",
    updatedAt: "",
  };
}

function prepared(needsAndroidPreparation = false) {
  const p = project();
  return {
    intent: {
      schemaVersion: 1,
      projectId: p.id,
      projectName: p.name,
      source: { remoteUrl: p.source.remoteUrl, branch: "main" },
      versionName: "2.0.0",
      requestedVersionCode: 8,
      versionCode: 10,
      applicationId: "app.victorytrack.android",
      adjustments: [
        { kind: "version-code", from: 8, to: 10, reason: "google-play-already-used" },
      ],
    },
    workspace: {
      workspacePath: "/workspaces/victorytrack-2",
      managedProjectPath: p.localPath,
      remoteUrl: p.source.remoteUrl,
      branch: "main",
      sourceSha: "2".repeat(40),
      shortSha: "2".repeat(10),
      sourceRelation: "up-to-date",
      sourceWorkingTree: "clean",
      createdAt: "2026-10-31T20:00:00.000Z",
      detected: { ...p.detected, hasAndroid: !needsAndroidPreparation },
    },
    project: {
      ...p,
      localPath: "/workspaces/victorytrack-2",
      currentBuild: 10,
      source: {
        ...p.source,
        headSha: "2".repeat(40),
        shortSha: "2".repeat(10),
        workingTree: "clean",
      },
    },
    corrections: {
      actions: [],
      changedFiles: ["version.json", "android/app/build.gradle"],
    },
    needsAndroidPreparation,
  };
}

describe("PublicationBuildService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockReturnValue([]);
  });

  it("builds from the clean workspace, promotes the AAB, then releases the workspace", async () => {
    const p = project();
    const ws = prepared(false);
    mocks.prepareWorkspace.mockResolvedValue(ws);
    mocks.buildCore.mockResolvedValue({
      succeeded: true,
      durationMs: 100,
      aabPath: "/workspaces/victorytrack-2/android/app-release.aab",
      aabReportPath: "/workspaces/victorytrack-2/android/app-release.aab.apppublisher-report.json",
      artifactSha256: "A".repeat(64),
      signatureSha256: "B".repeat(64),
      aabValidation: { verdict: "ready", reportPath: "/workspaces/old-report.json" },
    });
    mocks.promote.mockResolvedValue({
      artifactPath: "/stable/project-1/app-release.aab",
      reportPath: "/stable/project-1/app-release.aab.apppublisher-report.json",
      manifestPath: "/stable/project-1/publication-manifest.json",
      artifactSizeBytes: 1234,
      artifactSha256: "A".repeat(64),
      storedAt: "2026-10-31T21:00:00.000Z",
    });
    mocks.releaseWorkspace.mockResolvedValue({ released: true });

    const onStep = vi.fn();
    const result = await PublicationBuildService.build(p, { onStep });

    expect(mocks.buildCore).toHaveBeenCalledWith(
      ws.project,
      expect.objectContaining({
        preparedSource: {
          managedProjectPath: p.localPath,
          sourceSha: "2".repeat(40),
        },
      }),
    );
    expect(mocks.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: p.localPath,
        workspacePath: ws.workspace.workspacePath,
        versionCode: 10,
        applicationId: "app.victorytrack.android",
      }),
    );
    expect(mocks.releaseWorkspace).toHaveBeenCalledWith(p, ws);
    expect(result.aabPath).toBe("/stable/project-1/app-release.aab");
    expect(result.versionCode).toBe(10);
    expect(result.sourceCommit).toBe("2".repeat(40));
    expect(result.sourceDirty).toBe(false);
    expect(result.publicationManifestPath).toBe("/stable/project-1/publication-manifest.json");
    expect(result.aabValidation?.reportPath).toBe(
      "/stable/project-1/app-release.aab.apppublisher-report.json",
    );
  });

  it("creates Android inside the disposable workspace before reconciling intent", async () => {
    const p = project();
    const first = prepared(true);
    const reconciled = prepared(false);
    mocks.prepareWorkspace.mockResolvedValue(first);
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
      appName: "VictoryTrack",
      applicationId: "app.old",
      webDir: "dist",
      webOutputReady: false,
    });
    mocks.prepareAndroid.mockResolvedValue({
      outcome: { kind: "created" },
      durationMs: 1,
      applicationId: "app.victorytrack.android",
    });
    mocks.reconcileWorkspace.mockResolvedValue(reconciled);
    mocks.buildCore.mockResolvedValue({
      succeeded: true,
      durationMs: 100,
      aabPath: "/workspaces/victorytrack-2/app-release.aab",
    });
    mocks.promote.mockResolvedValue({
      artifactPath: "/stable/app-release.aab",
      manifestPath: "/stable/publication-manifest.json",
      artifactSizeBytes: 100,
      artifactSha256: "C".repeat(64),
      storedAt: "2026-10-31T21:00:00.000Z",
    });
    mocks.releaseWorkspace.mockResolvedValue({ released: true });

    await PublicationBuildService.build(p, { onStep: vi.fn() });

    expect(mocks.prepareAndroid).toHaveBeenCalledWith(
      first.project,
      expect.objectContaining({
        applicationId: "app.victorytrack.android",
        packageManager: "npm",
        webDir: "dist",
      }),
      expect.any(Object),
    );
    expect(mocks.reconcileWorkspace).toHaveBeenCalledWith(p, first);
    expect(mocks.buildCore).toHaveBeenCalledWith(
      reconciled.project,
      expect.objectContaining({ preparedSource: expect.any(Object) }),
    );
  });

  it("always releases the workspace when the core build fails", async () => {
    const p = project();
    const ws = prepared(false);
    mocks.prepareWorkspace.mockResolvedValue(ws);
    mocks.buildCore.mockRejectedValue(new Error("gradle failed"));
    mocks.releaseWorkspace.mockResolvedValue({ released: true });

    await expect(PublicationBuildService.build(p, { onStep: vi.fn() })).rejects.toThrow(
      /gradle failed/,
    );
    expect(mocks.promote).not.toHaveBeenCalled();
    expect(mocks.releaseWorkspace).toHaveBeenCalledWith(p, ws);
  });
});
