import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    mkdir: vi.fn(),
    stat: vi.fn(),
    copyFile: vi.fn(),
  };
});

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    fs: {
      mkdir: mocks.mkdir,
      stat: mocks.stat,
      copyFile: mocks.copyFile,
    },
  }),
}));

vi.mock("@/core/storage", () => ({
  storage: {
    get: (key: string, fallback: unknown) => mocks.values.get(key) ?? fallback,
    set: (key: string, value: unknown) => mocks.values.set(key, value),
  },
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { log: vi.fn() },
}));

vi.mock("@/core/copilot/bus", () => ({
  CopilotBus: { notify: vi.fn() },
}));

import { BackupService } from "./service";
import type { Project } from "@/core/types";

const project = {
  id: "project-1",
  name: "CranioScan",
  localPath: "/projects/cranioscan",
} as Project;

describe("BackupService", () => {
  beforeEach(() => {
    mocks.values.clear();
    mocks.mkdir.mockReset().mockResolvedValue(true);
    mocks.copyFile.mockReset().mockResolvedValue(true);
    mocks.stat.mockReset().mockImplementation(async (path: string) => {
      if (path.includes("version.json")) return { size: 20, isFile: true, isDir: false };
      if (path.includes("package.json")) return { size: 100, isFile: true, isDir: false };
      if (path.includes("android/app/build.gradle")) {
        return { size: 500, isFile: true, isDir: false };
      }
      return null;
    });
  });

  it("includes the Gradle file that AppPublisher mutates", async () => {
    const backup = await BackupService.create(project, "build");

    expect(backup.files.map((file) => file.path)).toEqual([
      "version.json",
      "package.json",
      "android/app/build.gradle",
      "android/app/build.gradle.kts",
    ]);
    expect(mocks.copyFile).toHaveBeenCalledWith(
      "/projects/cranioscan/android/app/build.gradle",
      expect.stringContaining("/android/app/build.gradle"),
    );
  });

  it("does not record a backup when its directory cannot be created", async () => {
    mocks.mkdir.mockResolvedValue(false);

    await expect(BackupService.create(project, "manual")).rejects.toThrow(/dossier de sauvegarde/);
    expect(BackupService.list(project.id)).toEqual([]);
  });

  it("verifies every restored file", async () => {
    const backup = await BackupService.create(project, "manual");

    await expect(BackupService.restore(project, backup.id)).resolves.toBe(true);
    expect(mocks.copyFile).toHaveBeenCalledWith(
      expect.stringContaining("/android/app/build.gradle"),
      "/projects/cranioscan/android/app/build.gradle",
    );
  });
});
