import { describe, expect, it } from "vitest";
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
