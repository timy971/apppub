import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";
const mocks = vi.hoisted(() => ({ check: vi.fn() }));
vi.mock("@/core/bridge", () => ({
  bridge: () => ({ runtime: "electron", git: { check: mocks.check } }),
}));
import {
  requireCurrentArtifactSource,
  requireCurrentGitSource,
  versionAfterSync,
} from "./release-source";
const project = {
  localPath: "/managed/app",
  source: { type: "git", remoteUrl: "https://github.com/acme/app", branch: "main" },
} as Project;

describe("release source gates", () => {
  beforeEach(() => {
    mocks.check.mockReset();
  });
  it.each(["behind", "ahead", "diverged", "no-upstream"])(
    "blocks %s after a fresh remote check",
    async (relation) => {
      mocks.check.mockResolvedValue({ relation, shortSha: "old" });
      await expect(requireCurrentGitSource(project)).rejects.toThrow(/Synchroniser/);
      expect(mocks.check).toHaveBeenCalledWith({
        projectPath: "/managed/app",
        remoteUrl: project.source!.remoteUrl,
        branch: "main",
      });
    },
  );
  it("does not treat an offline remote as up to date", async () => {
    mocks.check.mockRejectedValue(new Error("offline"));
    await expect(requireCurrentGitSource(project)).rejects.toThrow("offline");
  });
  it("allows generated working-tree changes when the remote source is current", async () => {
    mocks.check.mockResolvedValue({ relation: "up-to-date", headSha: "new", workingTree: "dirty" });
    await expect(requireCurrentGitSource(project)).resolves.toMatchObject({ headSha: "new" });
  });
  it("rejects an old or untraceable AAB even when the current checkout is up to date", async () => {
    mocks.check.mockResolvedValue({ relation: "up-to-date", headSha: "new" });
    await expect(requireCurrentArtifactSource(project, "old")).rejects.toThrow(/Reconstruisez/);
    await expect(requireCurrentArtifactSource(project)).rejects.toThrow(/inconnu/);
    await expect(requireCurrentArtifactSource(project, "new")).resolves.toBeUndefined();
  });
  it("keeps 1.2.0 when the source still says 1.1.0; accepts a genuinely newer version", () => {
    expect(versionAfterSync("1.2.0", "1.1.0")).toBe("1.2.0");
    expect(versionAfterSync("1.2.0", "1.10.0")).toBe("1.10.0");
    expect(versionAfterSync("2.0.0-beta", "1.0.0")).toBe("2.0.0-beta");
  });
});
