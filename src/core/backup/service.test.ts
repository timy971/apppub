import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    create: vi.fn(),
    restore: vi.fn(),
  };
});

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    backups: {
      create: mocks.create,
      restore: mocks.restore,
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
    mocks.create.mockReset().mockResolvedValue({
      location: "/projects/cranioscan/.apppublisher-backups/snapshot",
      files: [
        { path: "version.json", size: 20 },
        { path: "package.json", size: 100 },
        { path: "android/app/build.gradle", size: 500 },
      ],
    });
    mocks.restore
      .mockReset()
      .mockImplementation(async (_projectPath: string, location: string, files: unknown[]) => ({
        location,
        files,
      }));
  });

  it("includes the Gradle file that AppPublisher mutates", async () => {
    const backup = await BackupService.create(project, "build");

    expect(backup.files.map((file) => file.path)).toEqual([
      "version.json",
      "package.json",
      "android/app/build.gradle",
    ]);
    expect(mocks.create).toHaveBeenCalledWith("/projects/cranioscan", "build");
  });

  it("does not record a backup when its directory cannot be created", async () => {
    mocks.create.mockRejectedValue(new Error("Impossible de créer le dossier de sauvegarde."));

    await expect(BackupService.create(project, "manual")).rejects.toThrow(/dossier de sauvegarde/);
    expect(BackupService.list(project.id)).toEqual([]);
  });

  it("verifies every restored file", async () => {
    const backup = await BackupService.create(project, "manual");

    await expect(BackupService.restore(project, backup.id)).resolves.toBe(true);
    expect(mocks.restore).toHaveBeenCalledWith(
      "/projects/cranioscan",
      "/projects/cranioscan/.apppublisher-backups/snapshot",
      backup.files,
    );
  });
});
