import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionService } from "./service";
import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";

vi.mock("@/core/bridge", () => ({ bridge: vi.fn() }));

function make(v: string, b = 1): Project {
  return {
    id: "id",
    name: "T",
    localPath: "/tmp",
    currentVersion: v,
    currentBuild: b,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
    },
    createdAt: "",
    updatedAt: "",
  };
}

describe("VersionService.preview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("incrémente le patch pour bugfix", () => {
    expect(VersionService.preview(make("1.2.3"), "bugfix").to).toBe("1.2.4");
  });
  it("incrémente le mineur pour feature", () => {
    expect(VersionService.preview(make("1.2.3"), "feature").to).toBe("1.3.0");
  });
  it("incrémente le majeur", () => {
    expect(VersionService.preview(make("1.2.3"), "major").to).toBe("2.0.0");
  });
  it("garde la version pour readonly", () => {
    const p = VersionService.preview(make("1.2.3"), "readonly");
    expect(p.to).toBe("1.2.3");
    expect(p.newBuild).toBe(p.fromBuild);
  });
  it("incrémente le build sauf en readonly", () => {
    expect(VersionService.preview(make("1.0.0", 5), "feature").newBuild).toBe(6);
    expect(VersionService.preview(make("1.0.0", 5), "readonly").newBuild).toBe(5);
  });

  it("utilise directement le minimum exigé par Google Play", () => {
    expect(VersionService.preview(make("1.0.0", 1), "bugfix", 6).newBuild).toBe(6);
    expect(VersionService.preview(make("1.0.0", 8), "bugfix", 6).newBuild).toBe(9);
  });

  it("modifie directement la configuration Android sans script propre au projet", async () => {
    const apply = vi.fn().mockResolvedValue({ applied: true });
    const preview = vi.fn().mockResolvedValue({
      token: "version-plan",
      desired: { versionName: "1.2.4", versionCode: 6 },
      actions: [],
      blocked: [],
      changedFiles: ["android/app/build.gradle"],
      canApply: true,
      sensitive: false,
    });
    vi.mocked(bridge).mockReturnValue({
      runtime: "electron",
      androidCorrections: { preview, apply },
    } as unknown as ReturnType<typeof bridge>);

    await expect(VersionService.apply(make("1.2.3", 5), "bugfix")).resolves.toEqual({
      version: "1.2.4",
      build: 6,
    });
    expect(preview).toHaveBeenCalledWith("/tmp", {
      versionName: "1.2.4",
      versionCode: 6,
    });
    expect(apply).toHaveBeenCalledWith(
      "/tmp",
      { versionName: "1.2.4", versionCode: 6 },
      "version-plan",
    );
  });

  it("explique le blocage lorsque la configuration Android ne peut pas être modifiée", async () => {
    vi.mocked(bridge).mockReturnValue({
      runtime: "electron",
      androidCorrections: {
        preview: vi.fn().mockResolvedValue({
          token: "blocked-plan",
          desired: { versionName: "1.2.4", versionCode: 6 },
          actions: [],
          blocked: ["Le fichier Gradle de l'application est introuvable."],
          changedFiles: [],
          canApply: false,
          sensitive: false,
        }),
        apply: vi.fn(),
      },
    } as unknown as ReturnType<typeof bridge>);

    await expect(VersionService.apply(make("1.2.3", 5), "bugfix")).rejects.toThrow(
      "Le fichier Gradle de l'application est introuvable.",
    );
  });
});
