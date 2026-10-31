const mocks = vi.hoisted(() => ({
  prepareWorkspace: vi.fn(),
  releaseWorkspace: vi.fn(),
  preview: vi.fn(),
  apply: vi.fn(),
  detect: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    publicationWorkspace: {
      prepare: mocks.prepareWorkspace,
      release: mocks.releaseWorkspace,
    },
    androidCorrections: {
      preview: mocks.preview,
      apply: mocks.apply,
    },
    projects: {
      detect: mocks.detect,
    },
  }),
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";
import { PublicationWorkspaceService } from "./workspace-service";

function makeProject(): Project {
  return {
    id: "project-1",
    name: "VictoryTrack",
    localPath: "/managed/victorytrack",
    packageName: "vite_react_shadcn_ts",
    currentVersion: "3.2.1",
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
    },
    source: {
      type: "git",
      remoteUrl: "https://github.com/example/victorytrack.git",
      branch: "main",
      managed: true,
      headSha: "1".repeat(40),
      shortSha: "1".repeat(10),
      workingTree: "dirty",
      relation: "up-to-date",
    },
    publishing: {
      android: {
        applicationId: "app.victorytrack.android",
        googlePlayLastKnownBuild: 9,
        signingProfileId: "signing-victory",
      },
    },
    createdAt: "",
    updatedAt: "",
  };
}

function workspace(hasAndroid = true) {
  return {
    workspacePath: "/workspaces/victorytrack-remote",
    managedProjectPath: "/managed/victorytrack",
    remoteUrl: "https://github.com/example/victorytrack.git",
    branch: "main",
    sourceSha: "2".repeat(40),
    shortSha: "2".repeat(10),
    sourceRelation: "behind",
    sourceWorkingTree: "dirty",
    createdAt: "2026-10-31T20:00:00.000Z",
    detected: {
      hasPackageJson: true,
      hasAndroid,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      hasVersionScript: true,
      hasGradleWrapper: hasAndroid,
      currentVersion: "1.0.0",
      currentBuild: 1,
      packageName: "vite_react_shadcn_ts",
      capacitorAppId: "app.old.android",
    },
  };
}

describe("PublicationWorkspaceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies AppPublisher intent to a clean remote workspace", async () => {
    const p = makeProject();
    const ws = workspace(true);
    mocks.prepareWorkspace.mockResolvedValue(ws);
    mocks.preview
      .mockResolvedValueOnce({
        token: "plan-1",
        blocked: [],
        actions: [{ id: "package" }, { id: "version" }],
      })
      .mockResolvedValueOnce({
        token: "plan-2",
        blocked: [],
        actions: [],
      });
    mocks.apply.mockResolvedValue({
      applied: true,
      actions: [{ id: "package" }, { id: "version" }],
      changedFiles: ["capacitor.config.ts", "android/app/build.gradle", "version.json"],
    });
    mocks.detect.mockResolvedValue({
      ...ws.detected,
      capacitorAppId: "app.victorytrack.android",
      currentVersion: "3.2.1",
      currentBuild: 10,
    });

    const prepared = await PublicationWorkspaceService.prepare(p);

    expect(mocks.prepareWorkspace).toHaveBeenCalledWith({
      projectPath: "/managed/victorytrack",
      remoteUrl: "https://github.com/example/victorytrack.git",
      branch: "main",
    });
    const desired = {
      packageName: "app.victorytrack.android",
      versionName: "3.2.1",
      versionCode: 10,
    };
    expect(mocks.preview).toHaveBeenNthCalledWith(1, ws.workspacePath, desired);
    expect(mocks.apply).toHaveBeenCalledWith(ws.workspacePath, desired, "plan-1");
    expect(mocks.preview).toHaveBeenNthCalledWith(2, ws.workspacePath, desired);
    expect(prepared.intent.adjustments[0]).toMatchObject({ from: 8, to: 10 });
    expect(prepared.project.localPath).toBe(ws.workspacePath);
    expect(prepared.project.currentVersion).toBe("3.2.1");
    expect(prepared.project.currentBuild).toBe(10);
    expect(prepared.project.publishing?.android?.applicationId).toBe(
      "app.victorytrack.android",
    );
    expect(prepared.project.source?.headSha).toBe("2".repeat(40));
    expect(prepared.project.source?.workingTree).toBe("clean");
    expect(mocks.releaseWorkspace).not.toHaveBeenCalled();
  });

  it("returns a clean source needing Android preparation without forcing unsafe corrections", async () => {
    const p = makeProject();
    const ws = workspace(false);
    mocks.prepareWorkspace.mockResolvedValue(ws);

    const prepared = await PublicationWorkspaceService.prepare(p);

    expect(prepared.needsAndroidPreparation).toBe(true);
    expect(prepared.project.localPath).toBe(ws.workspacePath);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("discards the disposable workspace when intent correction is blocked", async () => {
    const p = makeProject();
    const ws = workspace(true);
    mocks.prepareWorkspace.mockResolvedValue(ws);
    mocks.preview.mockResolvedValue({
      token: "blocked",
      blocked: ["applicationId apparaît plusieurs fois."],
      actions: [],
    });

    await expect(PublicationWorkspaceService.prepare(p)).rejects.toThrow(
      /n’a pas pu préparer automatiquement/,
    );
    expect(mocks.releaseWorkspace).toHaveBeenCalledWith({
      projectPath: p.localPath,
      workspacePath: ws.workspacePath,
    });
  });
});
