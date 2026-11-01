import { describe, expect, it, vi } from "vitest";

describe("diagnostic refresh wiring", () => {
  it("keeps the route source wired to refresh persisted project detection before running diagnostic", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile(new URL("./diagnostic.tsx", import.meta.url), "utf8");
    expect(source).toContain("ProjectsService.refreshDetection(project.id)");
    expect(source).toContain("AppStore.refreshProjects()");
    expect(source).toContain("DiagnosticService.run(refreshedProject ?? project)");
  });
});
