import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  execRun: vi.fn(),
  resolveProfile: vi.fn(),
  journalLog: vi.fn(),
  syncVersion: vi.fn(),
  prepareSigning: vi.fn(),
  events: [] as string[],
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    exec: { run: mocks.execRun },
    fs: { exists: async () => true },
    gradle: { syncVersion: mocks.syncVersion },
  }),
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: {
    log: mocks.journalLog,
    logCommand: vi.fn(),
  },
}));

vi.mock("./signing-injector", () => ({
  SigningInjector: { resolveProfile: mocks.resolveProfile, prepare: mocks.prepareSigning },
}));

vi.mock("./gradle", () => ({
  resolveGradle: async () => ({ androidDir: "/projects/cranioscan/android" }),
  ensureGradleExecutable: vi.fn(),
  hasGlobalGradle: vi.fn(),
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
    mocks.syncVersion.mockReset();
    mocks.prepareSigning.mockReset();
    mocks.events.length = 0;
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

  it("synchronise aussi un projet déjà créé après Capacitor et avant la signature", async () => {
    mocks.resolveProfile.mockReturnValue({ ok: true });
    mocks.execRun.mockImplementation(async ({ cmd, args }) => {
      mocks.events.push([cmd, ...args].join(" "));
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
    });
    mocks.syncVersion.mockImplementation(async () => {
      mocks.events.push("sync version");
      return { changed: false };
    });
    mocks.prepareSigning.mockImplementation(async () => {
      mocks.events.push("prepare signing");
      return { ok: false, error: { message: "Fin du scénario de synchronisation" } };
    });
    await expect(BuildService.build(project, { onStep: vi.fn() })).rejects.toThrow(
      "Fin du scénario",
    );
    expect(mocks.syncVersion).toHaveBeenCalledWith(project.localPath, "1.0.0", 1);
    expect(mocks.events.slice(-3)).toEqual([
      "npx cap sync android",
      "sync version",
      "prepare signing",
    ]);
  });

  it("interrompt le build avant la signature si la version ne peut pas être écrite", async () => {
    mocks.resolveProfile.mockReturnValue({ ok: true });
    mocks.execRun.mockResolvedValue({ exitCode: 0, stdout: "", stderr: "", durationMs: 1 });
    mocks.syncVersion.mockRejectedValue(new Error("Écriture de version impossible"));
    const onStep = vi.fn();
    await expect(BuildService.build(project, { onStep })).rejects.toThrow(
      "Écriture de version impossible",
    );
    expect(mocks.prepareSigning).not.toHaveBeenCalled();
    expect(onStep).toHaveBeenCalledWith(
      "sync",
      "error",
      expect.stringContaining("version Android"),
    );
  });
});
