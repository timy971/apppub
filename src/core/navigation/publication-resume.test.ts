import { describe, expect, it, beforeEach } from "vitest";
import {
  consumeStartupResume,
  resetStartupResumeForTests,
  resolvePublicationResumePath,
} from "./publication-resume";

const recovery = {
  projectId: "project-1",
  versionName: "1.2.0",
  versionCode: 120,
  applicationId: "app.example.android",
  artifactPath: "/stable/app.aab",
  artifactSizeBytes: 42,
  artifactSha256: "A".repeat(64),
  manifestPath: "/stable/publication-manifest.json",
  storedAt: "2026-10-31T20:00:00.000Z",
};

describe("publication resume", () => {
  beforeEach(() => resetStartupResumeForTests());

  it("reprend la correction temporaire avant toute autre étape", () => {
    expect(
      resolvePublicationResumePath({
        lastJourneyPath: "/signing",
        returnToJourneyPath: "/build",
        recovery,
      }),
    ).toBe("/build");
  });

  it("reprend au Publish Center lorsqu'un AAB stable a déjà été récupéré", () => {
    expect(
      resolvePublicationResumePath({
        lastJourneyPath: "/build",
        recovery,
      }),
    ).toBe("/publish");
  });

  it("reprend le build interrompu lorsqu'aucun artefact durable n'existe", () => {
    expect(
      resolvePublicationResumePath({
        lastJourneyPath: "/build",
        recovery: null,
      }),
    ).toBe("/build");
  });

  it("ne force la reprise automatique qu'une fois par lancement renderer", () => {
    expect(consumeStartupResume()).toBe(true);
    expect(consumeStartupResume()).toBe(false);
  });
});
