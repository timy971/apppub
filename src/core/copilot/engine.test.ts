import { describe, expect, it } from "vitest";
import type { Project, PublishRecord } from "@/core/types";
import { buildCopilotPlan } from "./engine";
import { publishRule } from "./rules/publish";
import { configurationRule } from "./rules/configuration";
import { versionRule } from "./rules/version";
import type { CopilotRuleContext, CopilotRule } from "./types";

const project = {
  id: "project-1",
  name: "CranioScan",
  currentVersion: "2.1.0",
  currentBuild: 12,
} as Project;

const readyStatus: NonNullable<CopilotRuleContext["status"]> = {
  level: "ready",
  label: "Prêt",
  findings: [],
  counts: { error: 0, warn: 0, info: 0 },
};

function record(
  kind: PublishRecord["kind"],
  overrides: Partial<PublishRecord> = {},
): PublishRecord {
  return {
    id: `${kind}-${Math.random()}`,
    projectId: project.id,
    projectName: project.name,
    version: project.currentVersion,
    build: project.currentBuild,
    user: "Tim",
    durationMs: 100,
    outcome: "success",
    kind,
    createdAt: "2026-08-16T08:00:00.000Z",
    ...overrides,
  };
}

describe("buildCopilotPlan", () => {
  it("uses exactly the same six steps as the visible publication journey", () => {
    const completed: CopilotRule = {
      id: "completed",
      evaluate: () =>
        [
          ["project", "Application"],
          ["diagnostic", "Vérification"],
          ["version", "Version"],
          ["signing", "Signature"],
          ["build", "Fichier"],
        ].map(([completedStepId, headline], index) => ({
          id: `done-${completedStepId}`,
          kind: "success" as const,
          priority: 900 + index,
          headline,
          completedStepId,
        })),
    };

    const plan = buildCopilotPlan(
      { project, status: readyStatus, checks: [], history: [], backups: [] },
      [completed],
    );

    expect(plan.steps.map((step) => step.title)).toEqual([
      "Votre application",
      "Vérifier",
      "Préparer la version",
      "Protéger",
      "Créer le fichier",
      "Publier",
    ]);
    expect(plan.steps.at(-1)).toMatchObject({ id: "publish", status: "current" });
  });

  it("requires signature protection after versioning when no profile is linked", () => {
    const plan = buildCopilotPlan(
      {
        project,
        signingProfileIds: [],
        status: readyStatus,
        checks: [],
        history: [record("version")],
        backups: [],
      },
      [configurationRule, versionRule],
    );

    expect(plan.nextAction).toMatchObject({
      route: "/signing",
      title: "Protéger l'application",
    });
  });

  it("offers the Android build after versioning when the linked profile exists", () => {
    const signedProject = {
      ...project,
      publishing: { android: { signingProfileId: "release-profile" } },
    } as Project;
    const plan = buildCopilotPlan(
      {
        project: signedProject,
        signingProfileIds: ["release-profile"],
        status: readyStatus,
        checks: [],
        history: [record("version")],
        backups: [],
      },
      [configurationRule, versionRule],
    );

    expect(plan.nextAction.route).toBe("/build");
  });
});

describe("publishRule", () => {
  const build = record("build", { artifactPath: "/tmp/app.aab" });

  it("does not mark publication complete after a local preparation", () => {
    const result = publishRule.evaluate({
      project,
      status: readyStatus,
      checks: [],
      backups: [],
      history: [record("release-prepared"), build],
    });

    expect(result).toMatchObject({ id: "publish.prepared", kind: "information" });
    expect(result).not.toHaveProperty("completedStepId");
  });

  it("marks publication complete only after Google Play confirms the send", () => {
    const result = publishRule.evaluate({
      project,
      status: readyStatus,
      checks: [],
      backups: [],
      history: [
        record("publish", {
          storeRelease: {
            provider: "google-play",
            track: "internal",
            packageName: "app.cranioscan.android",
            versionCode: 12,
            releaseStatus: "completed",
            editId: "edit-1",
            accountEmail: "tim@example.com",
            authMode: "oauth",
            committedAt: "2026-08-16T08:00:00.000Z",
          },
        }),
        build,
      ],
    });

    expect(result).toMatchObject({ id: "publish.sent", completedStepId: "publish" });
  });
});
