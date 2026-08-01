import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  detect: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    projects: { detect: mocks.detect },
  }),
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { log: vi.fn() },
}));

vi.mock("@/core/diag/logger", () => ({
  diag: vi.fn(),
  diagOp: (_name: string, operation: () => Promise<unknown>) => operation(),
}));

import { ProjectsService } from "./service";

describe("ProjectsService.detectFromPath", () => {
  beforeEach(() => mocks.detect.mockReset());

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
});
