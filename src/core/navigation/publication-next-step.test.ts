import { describe, expect, it } from "vitest";
import type { Project } from "@/core/types";
import { nextStepAfterVersion } from "./publication-next-step";

function project(signingProfileId?: string): Project {
  return {
    id: "project-1",
    name: "CranioScan",
    localPath: "/tmp/cranioscan",
    currentVersion: "1.1.0",
    currentBuild: 2,
    detected: {},
    publishing: { android: { signingProfileId } },
  } as Project;
}

describe("nextStepAfterVersion", () => {
  it("opens signature protection when no profile is associated", () => {
    expect(nextStepAfterVersion(project(), [])).toEqual({
      to: "/signing",
      label: "Protéger l'application",
    });
  });

  it("opens signature protection when the associated profile no longer exists", () => {
    expect(nextStepAfterVersion(project("missing-profile"), ["another-profile"])).toEqual({
      to: "/signing",
      label: "Protéger l'application",
    });
  });

  it("opens the Android build only when the associated profile exists", () => {
    expect(nextStepAfterVersion(project("release-profile"), ["release-profile"])).toEqual({
      to: "/build",
      label: "Créer le fichier Android",
    });
  });
});
