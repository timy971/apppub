const mocks = vi.hoisted(() => ({ preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: "electron",
    androidCorrections: { preview: mocks.preview, apply: mocks.apply },
  }),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VersionService } from "./service";
import type { Project } from "@/core/types";

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
  it("incrémente le patch pour bugfix", () => {
    expect(VersionService.preview(make("1.2.3"), "bugfix").to).toBe("1.2.4");
  });

  it("garde la version visible pour un changement de build uniquement", () => {
    const preview = VersionService.preview(make("1.2.3"), "build");
    expect(preview.to).toBe("1.2.3");
    expect(preview.newBuild).toBe(preview.fromBuild + 1);
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
});

describe("VersionService.synchronizeSelected", () => {
  beforeEach(() => {
    mocks.preview.mockReset();
    mocks.apply.mockReset();
  });
  it("aligns disk metadata with selected 1.2.0 (19) without increasing it", async () => {
    const desired = { versionName: "1.2.0", versionCode: 19 };
    mocks.preview.mockResolvedValue({
      blocked: [],
      actions: [{ id: "version" }],
      desired,
      token: "checked",
    });
    mocks.apply.mockResolvedValue({ applied: true });
    await VersionService.synchronizeSelected(make("1.2.0", 19));
    expect(mocks.preview).toHaveBeenCalledWith("/tmp", desired);
    expect(mocks.apply).toHaveBeenCalledWith("/tmp", desired, "checked");
  });
  it("is idempotent when the source already has the selected version", async () => {
    mocks.preview.mockResolvedValue({ blocked: [], actions: [] });
    await VersionService.synchronizeSelected(make("1.2.0", 19));
    expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("blocks compilation if version synchronization is unsafe or cancelled", async () => {
    mocks.preview.mockResolvedValue({ blocked: ["expression Gradle"], actions: [] });
    await expect(VersionService.synchronizeSelected(make("1.2.0", 19))).rejects.toThrow(
      /expression Gradle/,
    );
    expect(mocks.apply).not.toHaveBeenCalled();
    mocks.preview.mockResolvedValue({ blocked: [], actions: [{}], desired: {}, token: "checked" });
    mocks.apply.mockResolvedValue({ applied: false });
    await expect(VersionService.synchronizeSelected(make("1.2.0", 19))).rejects.toThrow(/annulé/);
  });
});
