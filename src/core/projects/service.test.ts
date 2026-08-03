import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
  clone: vi.fn(),
  inspectRemote: vi.fn(),
  gitStatus: vi.fn(),
  gitCheck: vi.fn(),
  gitSync: vi.fn(),
  data: new Map<string, unknown>(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    projects: { detect: mocks.detect },
    git: {
      clone: mocks.clone,
      inspectRemote: mocks.inspectRemote,
      status: mocks.gitStatus,
      check: mocks.gitCheck,
      sync: mocks.gitSync,
    },
  }),
}));

vi.mock("@/core/storage", () => ({
  STORAGE_KEYS: { projects: "projects" },
  storage: {
    get: (key: string, fallback: unknown) => mocks.data.get(key) ?? fallback,
    set: (key: string, value: unknown) => void mocks.data.set(key, value),
    remove: (key: string) => void mocks.data.delete(key),
  },
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { log: vi.fn() },
}));

vi.mock("@/core/diag/logger", () => ({
  diag: vi.fn(),
  diagOp: (_name: string, operation: () => Promise<unknown>) => operation(),
}));

import { ProjectsService } from "./service";

describe("ProjectsService", () => {
  beforeEach(() => {
    mocks.detect.mockReset();
    mocks.clone.mockReset();
    mocks.inspectRemote.mockReset();
    mocks.gitStatus.mockReset();
    mocks.gitCheck.mockReset();
    mocks.gitSync.mockReset();
    mocks.data.clear();
  });

  it("rejects a folder that Electron has not authorized", async () => {
    mocks.detect.mockResolvedValue(null);

    await expect(ProjectsService.detectFromPath("/projects/app")).rejects.toThrow(/Parcourir/);
  });

  it("rejects a folder without package.json", async () => {
    mocks.detect.mockResolvedValue({
      hasPackageJson: false,
      hasVersionJson: false,
      hasCapacitorConfig: false,
      hasAndroid: false,
      hasIos: false,
      hasVersionScript: false,
      hasGradleWrapper: false,
      hasChangelog: false,
    });

    await expect(ProjectsService.detectFromPath("/projects/not-an-app")).rejects.toThrow(
      /package\.json/,
    );
  });

  it("returns a draft only for a detected project", async () => {
    mocks.detect.mockResolvedValue({
      hasPackageJson: true,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionScript: true,
      hasGradleWrapper: true,
      hasChangelog: false,
      displayName: "CranioScan",
      packageName: "cranioscan",
      currentVersion: "2.3.0",
      currentBuild: 17,
    });

    await expect(ProjectsService.detectFromPath("/projects/cranioscan")).resolves.toMatchObject({
      name: "CranioScan",
      localPath: "/projects/cranioscan",
      currentVersion: "2.3.0",
      currentBuild: 17,
      detected: { hasPackageJson: true, hasAndroid: true },
    });
  });

  it("imports a managed Git project with its branch and exact commit", async () => {
    mocks.clone.mockResolvedValue({
      localPath: "/managed/cranioscan-a1b2",
      reused: false,
      status: {
        remoteUrl: "https://github.com/timy971/cranioscan.git",
        branch: "main",
        headSha: "a".repeat(40),
        shortSha: "a".repeat(10),
        ahead: 0,
        behind: 0,
        relation: "up-to-date",
        workingTree: "clean",
        changedFiles: [],
        checkedAt: "2026-08-03T08:00:00.000Z",
      },
      detected: {
        hasPackageJson: true,
        hasVersionJson: true,
        hasCapacitorConfig: true,
        hasAndroid: true,
        hasIos: false,
        hasVersionScript: true,
        hasGradleWrapper: true,
        displayName: "CrânioScan",
        packageName: "cranioscan",
        currentVersion: "2.0.0",
        currentBuild: 12,
      },
    });

    const project = await ProjectsService.importFromGit(
      "https://github.com/timy971/cranioscan.git",
      "main",
    );

    expect(project).toMatchObject({
      name: "CrânioScan",
      localPath: "/managed/cranioscan-a1b2",
      githubRepo: "https://github.com/timy971/cranioscan.git",
      defaultBranch: "main",
      source: {
        type: "git",
        managed: true,
        branch: "main",
        headSha: "a".repeat(40),
      },
    });
  });

  it("does not clone the same remote branch twice", async () => {
    mocks.clone.mockResolvedValue({
      localPath: "/managed/demo",
      reused: false,
      status: {
        remoteUrl: "https://github.com/acme/demo.git",
        branch: "main",
        headSha: "b".repeat(40),
        shortSha: "b".repeat(10),
        ahead: 0,
        behind: 0,
        relation: "up-to-date",
        workingTree: "clean",
        changedFiles: [],
        checkedAt: "2026-08-03T08:00:00.000Z",
      },
      detected: {
        hasPackageJson: true,
        hasVersionJson: false,
        hasCapacitorConfig: false,
        hasAndroid: false,
        hasIos: false,
        hasVersionScript: false,
        hasGradleWrapper: false,
      },
    });
    await ProjectsService.importFromGit("https://github.com/acme/demo.git", "main");

    await expect(
      ProjectsService.importFromGit("https://github.com/acme/demo.git", "main"),
    ).rejects.toThrow(/déjà associé/);
    expect(mocks.clone).toHaveBeenCalledTimes(1);
  });

  it("refreshes detected metadata after a safe Git sync", async () => {
    const project = ProjectsService.save({
      name: "Demo",
      localPath: "/managed/demo",
      packageName: "custom.package",
      currentVersion: "1.0.0",
      currentBuild: 1,
      detected: {
        hasPackageJson: true,
        hasVersionJson: true,
        hasCapacitorConfig: false,
        hasAndroid: false,
        hasIos: false,
      },
      source: {
        type: "git",
        managed: true,
        remoteUrl: "https://github.com/acme/demo.git",
        branch: "main",
      },
      fieldSources: { packageName: "user" },
    });
    mocks.gitSync.mockResolvedValue({
      updated: true,
      previousHeadSha: "a".repeat(40),
      status: {
        remoteUrl: "https://github.com/acme/demo.git",
        branch: "main",
        headSha: "c".repeat(40),
        shortSha: "c".repeat(10),
        ahead: 0,
        behind: 0,
        relation: "up-to-date",
        workingTree: "clean",
        changedFiles: [],
        checkedAt: "2026-08-03T09:00:00.000Z",
      },
      detected: {
        hasPackageJson: true,
        hasVersionJson: true,
        hasCapacitorConfig: true,
        hasAndroid: true,
        hasIos: false,
        hasVersionScript: true,
        hasGradleWrapper: true,
        packageName: "remote.package",
        currentVersion: "1.1.0",
        currentBuild: 2,
      },
    });

    await ProjectsService.syncGit(project.id);
    expect(ProjectsService.get(project.id)).toMatchObject({
      packageName: "custom.package",
      currentVersion: "1.1.0",
      currentBuild: 2,
      source: { headSha: "c".repeat(40), workingTree: "clean" },
      detected: { hasAndroid: true },
    });
  });

  it("refreshes Android detection without resetting the project version", async () => {
    const project = ProjectsService.save({
      name: "Web App",
      localPath: "/projects/web-app",
      currentVersion: "3.4.0",
      currentBuild: 27,
      detected: {
        hasPackageJson: true,
        hasVersionJson: false,
        hasCapacitorConfig: false,
        hasAndroid: false,
        hasIos: false,
      },
    });
    mocks.detect.mockResolvedValue({
      hasPackageJson: true,
      hasVersionJson: false,
      hasCapacitorConfig: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionScript: false,
      hasGradleWrapper: true,
      androidReadiness: "ready",
      capacitorAppId: "app.web.android",
    });

    await ProjectsService.refreshDetection(project.id, "app.confirmed.android");
    expect(ProjectsService.get(project.id)).toMatchObject({
      currentVersion: "3.4.0",
      currentBuild: 27,
      detected: { hasAndroid: true, androidReadiness: "ready" },
      publishing: { android: { applicationId: "app.confirmed.android" } },
      fieldSources: { "android.applicationId": "user" },
    });
  });
});
