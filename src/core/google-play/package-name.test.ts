import { describe, expect, it } from "vitest";
import type { Project, PublishRecord } from "@/core/types";
import { resolveGooglePlayPackageName } from "./package-name";

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "CrânioScan",
    localPath: "/tmp/cranioscan",
    packageName: "vite_react_shadcn_ts",
    currentVersion: "1.1.0",
    currentBuild: 2,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      capacitorAppId: "app.cranioscan.android",
    },
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveGooglePlayPackageName", () => {
  it("prefers the Android applicationId over npm package names", () => {
    expect(
      resolveGooglePlayPackageName(
        project({
          publishing: { android: { applicationId: "app.explicit.android" } },
        }),
      ),
    ).toBe("app.explicit.android");
  });

  it("uses the validated AAB identity before a generic package.json name", () => {
    const release = {
      aabValidation: { packageName: "app.validated.android" },
    } as PublishRecord;
    expect(resolveGooglePlayPackageName(project({ detected: { ...project().detected, capacitorAppId: undefined } }), release)).toBe(
      "app.validated.android",
    );
  });

  it("uses the Capacitor appId and rejects vite-style npm names", () => {
    expect(resolveGooglePlayPackageName(project())).toBe("app.cranioscan.android");
  });

  it("returns empty when no Android-like identifier exists", () => {
    expect(
      resolveGooglePlayPackageName(
        project({
          packageName: "vite_react_shadcn_ts",
          playStoreAppId: undefined,
          detected: { ...project().detected, capacitorAppId: undefined },
        }),
      ),
    ).toBe("");
  });
});
