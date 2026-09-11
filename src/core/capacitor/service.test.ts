import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";
import type { AndroidPreparationRequest } from "@/core/bridge/types";

const mocks = vi.hoisted(() => ({
  execRun: vi.fn(),
  syncVersion: vi.fn(),
  events: [] as string[],
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    androidPreparation: {
      inspect: async () => ({
        status: "preparable",
        packageManager: "npm",
        hasCapacitorCore: true,
        hasCapacitorCli: true,
        hasCapacitorAndroid: true,
      }),
      createConfig: async () => ({ created: true }),
    },
    exec: { run: mocks.execRun },
    fs: { exists: async () => true },
    gradle: {
      syncVersion: mocks.syncVersion,
      ensureExecutable: async () => ({ ok: true }),
    },
    system: { detect: async () => ({ platform: "linux" }) },
  }),
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { logCommand: vi.fn() },
}));

import {
  capacitorInstall,
  CapacitorService,
  CERTIFIED_CAPACITOR_VERSION,
  dependencyInstall,
  webBuild,
} from "./service";

const packages = [
  `@capacitor/cli@${CERTIFIED_CAPACITOR_VERSION}`,
  `@capacitor/android@${CERTIFIED_CAPACITOR_VERSION}`,
  `@capacitor/core@${CERTIFIED_CAPACITOR_VERSION}`,
];

describe("CapacitorService — commandes de préparation", () => {
  it("verrouille les trois composants sur la version certifiée", () => {
    expect(CERTIFIED_CAPACITOR_VERSION).toBe("8.5.0");
    expect(capacitorInstall("npm")).toEqual({
      cmd: "npm",
      args: ["install", "--save-exact", ...packages],
    });
    expect(capacitorInstall("pnpm")).toEqual({
      cmd: "pnpm",
      args: ["add", "--save-exact", ...packages],
    });
    expect(capacitorInstall("yarn")).toEqual({
      cmd: "yarn",
      args: ["add", "--exact", ...packages],
    });
    expect(capacitorInstall("bun")).toEqual({
      cmd: "bun",
      args: ["add", "--exact", ...packages],
    });
  });

  it("conserve les commandes exactes d’installation et de build web", () => {
    expect(dependencyInstall("npm")).toEqual({ cmd: "npm", args: ["install"] });
    expect(webBuild("npm")).toEqual({ cmd: "npm", args: ["run", "build"] });
    expect(webBuild("yarn")).toEqual({ cmd: "yarn", args: ["build"] });
  });
});

describe("CapacitorService — version de la première création", () => {
  const project = {
    id: "first-app",
    name: "First App",
    localPath: "/projects/first-app",
    currentVersion: "1.0.0",
    currentBuild: 1,
  } as Project;
  const request: AndroidPreparationRequest = {
    applicationId: "app.first.android",
    appName: "First App",
    webDir: "dist",
    packageManager: "npm",
  };

  beforeEach(() => {
    mocks.events.length = 0;
    mocks.execRun.mockReset().mockImplementation(async ({ cmd, args }) => {
      mocks.events.push([cmd, ...args].join(" "));
      return { exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
    });
    mocks.syncVersion.mockReset().mockImplementation(async () => {
      mocks.events.push("sync version");
      return { changed: false };
    });
  });

  it("applique 1.0.0 (1) après Capacitor et avant la première compilation", async () => {
    const result = await CapacitorService.prepareAndroid(project, request, { onStep: vi.fn() });
    expect(result.outcome.kind).toBe("created");
    expect(mocks.syncVersion).toHaveBeenCalledWith(project.localPath, "1.0.0", 1);
    expect(mocks.events.slice(-3)).toEqual([
      "npx cap sync android",
      "sync version",
      "gradlew assembleDebug",
    ]);
  });

  it("arrête la création avant Gradle si la synchronisation échoue", async () => {
    mocks.syncVersion.mockRejectedValue(new Error("Écriture impossible"));
    const onStep = vi.fn();
    const result = await CapacitorService.prepareAndroid(project, request, { onStep });
    expect(result.outcome).toEqual({
      kind: "failed",
      message: expect.stringContaining("Écriture impossible"),
    });
    expect(mocks.events.some((event) => event.includes("assembleDebug"))).toBe(false);
    expect(onStep).toHaveBeenCalledWith(
      "sync",
      "error",
      expect.stringContaining("version Android"),
    );
  });
});
