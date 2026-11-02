import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/core/types";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}));

vi.mock("@/core/projects/service", () => ({
  ProjectsService: {
    update: mocks.update,
  },
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    googlePlay: {
      trackStatus: vi.fn(),
    },
  }),
}));

import { applyGooglePlayStatus } from "./status-sync";

function project(lifecycle: Project["lifecycle"] = "development"): Project {
  return {
    id: "cranioscan",
    name: "CrânioScan",
    localPath: "/tmp/cranioscan",
    currentVersion: "1.2.0",
    currentBuild: 4,
    lifecycle,
    detected: {
      hasPackageJson: true,
      hasAndroid: true,
      hasIos: false,
      hasVersionJson: true,
      hasCapacitorConfig: true,
      capacitorAppId: "app.cranioscan.android",
    },
    publishing: {
      android: {
        applicationId: "app.cranioscan.android",
        googlePlayConnectionId: "gplay_cranioscan",
      },
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("Google Play status sync", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.update.mockImplementation((_id, patch) => ({ ...project(), ...patch }));
  });

  it("marks a development project as published when production is completed", () => {
    applyGooglePlayStatus(project(), [
      {
        track: "production",
        versionCodes: [4],
        countryAvailability: {
          countries: ["HK", "NA"],
          restOfWorld: false,
          syncWithProduction: false,
        },
        releases: [{ status: "completed", versionCodes: [4] }],
      },
    ]);

    expect(mocks.update).toHaveBeenCalledWith(
      "cranioscan",
      expect.objectContaining({
        lifecycle: "published",
        publishing: expect.objectContaining({
          android: expect.objectContaining({
            googlePlayProductionStatus: "completed",
            googlePlayProductionCountries: ["HK", "NA"],
            googlePlayProductionVersionCodes: [4],
          }),
        }),
      }),
    );
  });

  it.each(["draft", "halted"] as const)(
    "does not mark a project as published for %s production",
    (status) => {
      applyGooglePlayStatus(project(), [
        {
          track: "production",
          versionCodes: [4],
          releases: [{ status, versionCodes: [4] }],
        },
      ]);

      expect(mocks.update).toHaveBeenCalledWith(
        "cranioscan",
        expect.objectContaining({ lifecycle: "development" }),
      );
    },
  );

  it("keeps the project published when an older production release is still served", () => {
    applyGooglePlayStatus(project(), [
      {
        track: "production",
        versionCodes: [5, 4],
        releases: [
          { status: "draft", versionCodes: [5] },
          { status: "completed", versionCodes: [4] },
        ],
      },
    ]);

    expect(mocks.update).toHaveBeenCalledWith(
      "cranioscan",
      expect.objectContaining({ lifecycle: "published" }),
    );
  });

  it("never overwrites the archived lifecycle automatically", () => {
    applyGooglePlayStatus(project("archived"), [
      {
        track: "production",
        versionCodes: [4],
        releases: [{ status: "completed", versionCodes: [4] }],
      },
    ]);

    expect(mocks.update).toHaveBeenCalledWith(
      "cranioscan",
      expect.objectContaining({ lifecycle: "archived" }),
    );
  });
});
