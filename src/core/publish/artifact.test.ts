import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runtime: "electron" as "electron" | "web",
  stat: vi.fn(),
  inspectAab: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    runtime: mocks.runtime,
    fs: { stat: mocks.stat },
    aab: { inspect: mocks.inspectAab },
  }),
}));

import { verifyPublishArtifact } from "./artifact";
import type { Project, PublishRecord } from "@/core/types";

const project = {
  id: "project-1",
  currentVersion: "2.1.0",
  currentBuild: 12,
} as Project;

function build(overrides: Partial<PublishRecord> = {}): PublishRecord {
  return {
    id: "build-1",
    projectId: project.id,
    projectName: "CranioScan",
    version: project.currentVersion,
    build: project.currentBuild,
    user: "Tim",
    durationMs: 100,
    outcome: "success",
    kind: "build",
    artifactPath: "/projects/cranioscan/app-release.aab",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("verifyPublishArtifact", () => {
  beforeEach(() => {
    mocks.runtime = "electron";
    mocks.stat.mockReset().mockResolvedValue({ size: 2048, isFile: true, isDir: false });
    mocks.inspectAab.mockReset().mockResolvedValue({
      schemaVersion: 1,
      inspectedAt: "2026-08-03T00:00:00.000Z",
      verdict: "ready",
      modules: ["base"],
      artifactSizeBytes: 2048,
      signatureValid: true,
      expected: {},
      bundletool: { status: "passed" },
      issues: [],
    });
  });

  it("rejects stale build history", async () => {
    const result = await verifyPublishArtifact(project, [build({ build: 11 })]);
    expect(result.status).toBe("missing");
    expect(mocks.stat).not.toHaveBeenCalled();
  });

  it("rejects a build whose AAB has disappeared", async () => {
    mocks.stat.mockResolvedValue(null);
    const result = await verifyPublishArtifact(project, [build()]);
    expect(result.status).toBe("missing");
    expect(result.detail).toMatch(/introuvable/);
  });

  it("rejects an unsigned or corrupted AAB", async () => {
    mocks.inspectAab.mockResolvedValue({
      schemaVersion: 1,
      inspectedAt: "2026-08-03T00:00:00.000Z",
      verdict: "blocked",
      modules: ["base"],
      artifactSizeBytes: 2048,
      signatureValid: false,
      expected: {},
      bundletool: { status: "passed" },
      issues: [
        {
          id: "signature-invalid",
          severity: "error",
          title: "Signature invalide",
          detail: "Signature absente.",
        },
      ],
    });
    const result = await verifyPublishArtifact(project, [build()]);
    expect(result.status).toBe("invalid");
    expect(result.detail).toBe("Signature absente.");
  });

  it("accepts only an existing non-empty signed AAB", async () => {
    const result = await verifyPublishArtifact(project, [build()]);
    expect(result).toMatchObject({
      status: "valid",
      path: "/projects/cranioscan/app-release.aab",
      size: 2048,
    });
  });
});
