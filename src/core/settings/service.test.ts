import { describe, expect, it } from "vitest";
import { SettingsService } from "@/core/settings/service";

describe("SettingsService", () => {
  it("removes optional fields cleared with undefined before persistence", () => {
    const settings = SettingsService.update({
      lastJourneyPath: "/projects",
      returnToJourneyPath: undefined,
    });

    expect(settings.lastJourneyPath).toBe("/projects");
    expect(Object.hasOwn(settings, "returnToJourneyPath")).toBe(false);
  });
});
