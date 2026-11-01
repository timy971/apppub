import { describe, expect, it } from "vitest";
import type { AabValidationReport, Project } from "@/core/types";
import { evaluatePlayCompliance, GOOGLE_PLAY_RULES } from "./service";

function project(): Project {
  return {
    id: "p1",
    name: "VictoryTrack",
    localPath: "/managed/victorytrack",
    currentVersion: "1.0.0",
    currentBuild: 4,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: false,
      hasCapacitorConfig: true,
    },
    publishing: {
      android: {
        applicationId: "app.victorytrack.android",
      },
    },
    createdAt: "",
    updatedAt: "",
  };
}

function report(targetSdk = 36): AabValidationReport {
  return {
    schemaVersion: 1,
    inspectedAt: "2026-11-01T12:00:00.000Z",
    verdict: "ready",
    packageName: "app.victorytrack.android",
    versionName: "1.0.0",
    versionCode: 4,
    minSdk: 24,
    targetSdk,
    certifiedTargetSdk: 36,
    modules: ["base"],
    artifactSizeBytes: 10,
    signatureValid: true,
    expected: {},
    bundletool: { status: "passed" },
    issues: [],
  };
}

describe("Google Play compliance", () => {
  it("bloque un targetSdk inférieur à l'exigence mobile actuelle", () => {
    const checks = evaluatePlayCompliance(project(), report(35));
    expect(GOOGLE_PLAY_RULES.mobileTargetSdk).toBe(36);
    expect(checks.find((c) => c.id === "play-target-sdk")).toMatchObject({
      severity: "error",
    });
  });

  it("valide le targetSdk 36 et ne fabrique pas de conformité de compte", () => {
    const checks = evaluatePlayCompliance(project(), report(36));
    expect(checks.find((c) => c.id === "play-target-sdk")).toMatchObject({
      severity: "ok",
    });
    expect(checks.find((c) => c.id === "play-developer-verification")).toMatchObject({
      severity: "info",
    });
    expect(checks.find((c) => c.id === "play-package-registration")).toMatchObject({
      severity: "info",
    });
  });

  it("rappelle 12 testeurs pendant 14 jours pour un nouveau compte personnel", () => {
    const p = project();
    p.publishing = {
      android: {
        ...p.publishing?.android,
        googlePlayAccountKind: "personal-new",
        googlePlayClosedTestingStatus: "pending",
      },
    };
    const check = evaluatePlayCompliance(p, report()).find(
      (c) => c.id === "play-closed-testing",
    );
    expect(GOOGLE_PLAY_RULES.closedTestersRequired).toBe(12);
    expect(GOOGLE_PLAY_RULES.closedTestDaysRequired).toBe(14);
    expect(check).toMatchObject({ severity: "warn" });
    expect(check?.detail).toMatch(/12 testeurs/);
    expect(check?.detail).toMatch(/14 jours/);
  });

  it("passe le test fermé au vert après confirmation explicite", () => {
    const p = project();
    p.publishing = {
      android: {
        ...p.publishing?.android,
        googlePlayAccountKind: "personal-new",
        googlePlayClosedTestingStatus: "completed",
      },
    };
    expect(
      evaluatePlayCompliance(p, report()).find((c) => c.id === "play-closed-testing"),
    ).toMatchObject({ severity: "ok" });
  });
});
