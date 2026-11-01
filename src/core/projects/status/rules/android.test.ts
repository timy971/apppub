import { describe, expect, it } from "vitest";
import type { Project } from "@/core/types";
import { androidRules } from "./android";

function baseProject(): Project {
  return {
    id: "victorytrack",
    name: "Victory Track",
    localPath: "/managed/victorytrack",
    currentVersion: "1.0.0",
    currentBuild: 4,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: false,
      hasCapacitorConfig: true,
      hasVersionScript: false,
      hasGradleWrapper: false,
      androidReadiness: "blocked",
      androidReadinessReason:
        "Le dossier android/ existe mais il est incomplet. AppPublisher refuse de l’écraser.",
      capacitorAppId: "app.victorytrack.android",
    },
    source: {
      type: "git",
      remoteUrl: "https://github.com/example/victorytrack.git",
      branch: "main",
      managed: true,
    },
    publishing: {
      android: {
        applicationId: "app.victorytrack.android",
        signingProfileId: "victory-signing",
      },
    },
    createdAt: "",
    updatedAt: "",
  };
}

describe("androidRules — workspace jetable", () => {
  it("ne bloque pas un projet Git géré dont Android incomplet sera recréé", () => {
    const project = baseProject();
    const folder = androidRules.find((rule) => rule.id === "android.folder")?.evaluate({ project });
    const gradle = androidRules.find((rule) => rule.id === "android.gradle")?.evaluate({ project });

    expect(folder).toMatchObject({
      severity: "info",
      message: "Android sera reconstruit automatiquement lors de la publication.",
    });
    expect(gradle).toBeNull();
  });

  it("continue de bloquer un vrai problème Android non réparable", () => {
    const project = baseProject();
    project.detected.androidReadinessReason =
      "capacitor.config.ts ne contient pas d’appId littéral.";

    const folder = androidRules.find((rule) => rule.id === "android.folder")?.evaluate({ project });
    expect(folder).toMatchObject({
      severity: "error",
      message: "Ce projet web ne peut pas encore être préparé automatiquement pour Android.",
    });
  });
});
