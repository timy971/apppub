import { describe, expect, it } from "vitest";
import { desiredCorrections, manualCorrections } from "./corrections";
import type { AabValidationReport } from "@/core/types";

function report(issueIds: string[]): AabValidationReport {
  return {
    schemaVersion: 1,
    inspectedAt: "2026-08-08T00:00:00.000Z",
    verdict: "blocked",
    packageName: "app.wrong",
    versionName: "1.0.0",
    versionCode: 4,
    minSdk: 35,
    targetSdk: 34,
    modules: ["base"],
    artifactSizeBytes: 10,
    signatureValid: true,
    expected: {
      packageName: "app.expected.release",
      versionName: "1.1.0",
      versionCode: 5,
    },
    bundletool: { status: "passed" },
    issues: issueIds.map((id) => ({ id, severity: "error", title: id, detail: id })),
  };
}

describe("Android AAB correction mapping", () => {
  it("only proposes values backed by a matching validation issue", () => {
    expect(
      desiredCorrections(
        report([
          "package-mismatch",
          "version-name-mismatch",
          "version-code-mismatch",
          "sdk-invalid",
        ]),
      ),
    ).toEqual({
      packageName: "app.expected.release",
      versionName: "1.1.0",
      versionCode: 5,
      targetSdk: 35,
    });
  });

  it("never turns a signing mismatch into an automatic file edit", () => {
    const value = report(["signer-mismatch"]);
    expect(desiredCorrections(value)).toEqual({});
    expect(manualCorrections(value)[0]).toMatchObject({ destination: "signing" });
  });

  it("does not guess a target SDK when the manifest values are unavailable", () => {
    const value = report(["sdk-unreadable"]);
    value.minSdk = undefined;
    value.targetSdk = undefined;
    expect(desiredCorrections(value)).toEqual({});
    expect(manualCorrections(value)[0].title).toContain("SDK");
  });
});
