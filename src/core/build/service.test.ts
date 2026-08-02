import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  execRun: vi.fn(),
  resolveProfile: vi.fn(),
  journalLog: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    exec: { run: mocks.execRun },
  }),
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: {
    log: mocks.journalLog,
    logCommand: vi.fn(),
  },
}));

vi.mock("./signing-injector", () => ({
  SigningInjector: { resolveProfile: mocks.resolveProfile },
}));

import { BuildService } from "./service";

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
  publishing: { android: { signingProfileId: "ancien-profil" } },
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

describe("BuildService — validation initiale de la signature", () => {
  beforeEach(() => {
    mocks.execRun.mockReset();
    mocks.resolveProfile.mockReset();
    mocks.journalLog.mockReset();
  });

  it("s'arrête avant npm et Capacitor lorsque le profil associé est introuvable", async () => {
    mocks.resolveProfile.mockReturnValue({
      ok: false,
      error: {
        code: "profile-missing",
        message: "Le profil de signature associé au projet est introuvable.",
      },
    });
    const onStep = vi.fn();

    await expect(BuildService.build(project, { onStep })).rejects.toThrow(
      /profil de signature associé/i,
    );

    expect(onStep).toHaveBeenCalledWith(
      "prepare",
      "error",
      expect.stringMatching(/profil de signature associé/i),
    );
    expect(mocks.execRun).not.toHaveBeenCalled();
  });
});
