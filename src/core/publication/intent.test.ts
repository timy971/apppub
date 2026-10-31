import { describe, expect, it } from "vitest";
import type { Project } from "@/core/types";
import type { PublicationWorkspaceResult } from "@/core/bridge/types";
import {
  createPublicationIntent,
  isAndroidApplicationId,
  projectForPublicationWorkspace,
  resolvePublicationApplicationId,
} from "./intent";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    name: "CrânioScan",
    localPath: "/managed/cranioscan",
    packageName: "vite_react_shadcn_ts",
    currentVersion: "1.2.3",
    currentBuild: 7,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      hasVersionScript: true,
      hasGradleWrapper: true,
      capacitorAppId: "app.cranioscan.android",
    },
    source: {
      type: "git",
      remoteUrl: "https://github.com/example/cranioscan.git",
      branch: "main",
      managed: true,
      headSha: "1".repeat(40),
      shortSha: "1".repeat(10),
      workingTree: "dirty",
      relation: "up-to-date",
    },
    publishing: {
      android: {
        applicationId: "app.cranioscan.android",
        signingProfileId: "signing-1",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function workspace(overrides: Partial<PublicationWorkspaceResult> = {}): PublicationWorkspaceResult {
  return {
    workspacePath: "/publication-workspaces/cranioscan-abcdef",
    managedProjectPath: "/managed/cranioscan",
    remoteUrl: "https://github.com/example/cranioscan.git",
    branch: "main",
    sourceSha: "2".repeat(40),
    shortSha: "2".repeat(10),
    sourceRelation: "behind",
    sourceWorkingTree: "dirty",
    createdAt: "2026-10-31T20:00:00.000Z",
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      hasVersionScript: true,
      hasGradleWrapper: true,
      currentVersion: "1.0.0",
      currentBuild: 2,
      packageName: "vite_react_shadcn_ts",
      capacitorAppId: "app.old.android",
    },
    ...overrides,
  };
}

describe("publication intent", () => {
  it("never uses an npm technical name as the Android identity", () => {
    expect(isAndroidApplicationId("vite_react_shadcn_ts")).toBe(false);
    expect(isAndroidApplicationId("app.cranioscan.android")).toBe(true);

    const p = project({
      publishing: { android: { applicationId: undefined } },
      playStoreAppId: undefined,
      detected: {
        ...project().detected,
        capacitorAppId: "app.cranioscan.android",
      },
      packageName: "vite_react_shadcn_ts",
    });
    expect(resolvePublicationApplicationId(p)).toBe("app.cranioscan.android");

    const legacy = project({
      publishing: { android: { applicationId: undefined } },
      playStoreAppId: undefined,
      detected: { ...project().detected, capacitorAppId: "app.cranioscan.android" },
      packageName: "vite_react_shadcn_ts",
    });
    expect(resolvePublicationApplicationId(legacy)).toBe("app.cranioscan.android");
  });

  it("keeps the connected Play Console package as the immutable strongest identity", () => {
    const p = project({
      playStoreAppId: "app.play.immutable",
      packageName: "vite_react_shadcn_ts",
      detected: { ...project().detected, capacitorAppId: "app.old.capacitor" },
      publishing: {
        android: {
          applicationId: "app.victorytrack.android",
          signingProfileId: "signing-victory",
        },
      },
    });
    expect(resolvePublicationApplicationId(p)).toBe("app.play.immutable");
  });

  it("prefers explicit Android configuration over Capacitor and npm when Play is not established", () => {
    const p = project({
      playStoreAppId: undefined,
      packageName: "vite_react_shadcn_ts",
      detected: { ...project().detected, capacitorAppId: "app.old.capacitor" },
      publishing: {
        android: {
          applicationId: "app.victorytrack.android",
          signingProfileId: "signing-victory",
        },
      },
    });
    expect(resolvePublicationApplicationId(p)).toBe("app.victorytrack.android");
  });

  it("automatically selects the next safe Google Play build number", () => {
    const p = project({
      currentBuild: 7,
      publishing: {
        android: {
          applicationId: "app.cranioscan.android",
          googlePlayLastKnownBuild: 9,
        },
      },
    });
    const intent = createPublicationIntent(p, { knownPublishedBuilds: [3, 12, 6] });
    expect(intent.requestedVersionCode).toBe(7);
    expect(intent.versionCode).toBe(13);
    expect(intent.adjustments).toEqual([
      {
        kind: "version-code",
        from: 7,
        to: 13,
        reason: "google-play-already-used",
      },
    ]);
  });

  it("keeps a selected build number when it is already above known Play builds", () => {
    const p = project({
      currentBuild: 20,
      publishing: {
        android: {
          applicationId: "app.cranioscan.android",
          googlePlayLastKnownBuild: 9,
        },
      },
    });
    const intent = createPublicationIntent(p, { knownPublishedBuilds: [12] });
    expect(intent.versionCode).toBe(20);
    expect(intent.adjustments).toEqual([]);
  });

  it("keeps AppPublisher-selected release values when the clean remote snapshot is older", () => {
    const p = project({
      currentVersion: "2.4.1",
      currentBuild: 44,
      publishing: {
        android: {
          applicationId: "app.cranioscan.android",
          signingProfileId: "signing-1",
        },
      },
    });
    const intent = createPublicationIntent(p);
    const derived = projectForPublicationWorkspace(p, workspace(), intent);

    expect(derived.localPath).toBe("/publication-workspaces/cranioscan-abcdef");
    expect(derived.currentVersion).toBe("2.4.1");
    expect(derived.currentBuild).toBe(44);
    expect(derived.publishing?.android?.applicationId).toBe("app.cranioscan.android");
    expect(derived.detected.currentVersion).toBe("1.0.0");
    expect(derived.detected.currentBuild).toBe(2);
    expect(derived.detected.capacitorAppId).toBe("app.cranioscan.android");
    expect(derived.source?.headSha).toBe("2".repeat(40));
    expect(derived.source?.workingTree).toBe("clean");
    expect(derived.source?.relation).toBe("up-to-date");
  });

  it("refuses to combine an intent with a workspace from another source", () => {
    const p = project();
    const intent = createPublicationIntent(p);
    expect(() =>
      projectForPublicationWorkspace(
        p,
        workspace({ remoteUrl: "https://github.com/example/other.git" }),
        intent,
      ),
    ).toThrow(/ne correspond pas à la source prévue/);
  });

  it("blocks publication when no trustworthy Android applicationId exists", () => {
    const p = project({
      packageName: "vite_react_shadcn_ts",
      playStoreAppId: "not-an-android-id",
      detected: { ...project().detected, capacitorAppId: undefined },
      publishing: { android: { applicationId: undefined } },
    });
    expect(() => createPublicationIntent(p)).toThrow(/aucun identifiant Android fiable/);
  });
});
