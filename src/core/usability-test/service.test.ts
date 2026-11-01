import { beforeEach, describe, expect, it, vi } from "vitest";

const data = new Map<string, unknown>();
type HistoryFixture = {
  kind: "publish";
  outcome: "success";
  createdAt: string;
  storeRelease: { provider: "google-play" };
  projectName: string;
  version: string;
  build: number;
};
const history: HistoryFixture[] = [];

vi.mock("@/core/storage", () => ({
  STORAGE_KEYS: { usabilityTest: "usability-test" },
  storage: {
    get: (key: string, fallback: unknown) => data.get(key) ?? fallback,
    set: (key: string, value: unknown) => void data.set(key, value),
    remove: (key: string) => void data.delete(key),
  },
}));

vi.mock("@/core/history/service", () => ({
  HistoryService: {
    list: () => history,
  },
}));

describe("UsabilityTestService", () => {
  beforeEach(async () => {
    data.clear();
    history.length = 0;
    vi.resetModules();
  });

  it("enregistre les routes et les frottements sans doublonner la même route", async () => {
    const { UsabilityTestService } = await import("./service");
    UsabilityTestService.start("Marie");
    UsabilityTestService.visit("/setup");
    UsabilityTestService.visit("/setup");
    UsabilityTestService.record("confusion", "/setup");
    UsabilityTestService.record("blocked", "/diagnostic");

    const session = UsabilityTestService.current();
    expect(session?.events.filter((event) => event.kind === "route")).toHaveLength(1);
    expect(session?.events.filter((event) => event.kind === "confusion")).toHaveLength(1);
    expect(session?.events.filter((event) => event.kind === "blocked")).toHaveLength(1);
  });

  it("ignore une publication Google Play antérieure au début de la session", async () => {
    history.push({
      kind: "publish",
      outcome: "success",
      createdAt: "2026-01-01T00:00:00.000Z",
      storeRelease: { provider: "google-play" },
      projectName: "Ancienne app",
      version: "1.0.0",
      build: 1,
    });

    const { UsabilityTestService } = await import("./service");
    UsabilityTestService.start("Marie");
    const completed = UsabilityTestService.finish();

    expect(completed?.googlePlaySuccess).toBe(false);
  });

  it("valide uniquement une publication réelle effectuée pendant la session", async () => {
    const { UsabilityTestService } = await import("./service");
    const started = UsabilityTestService.start("Marie");

    history.push({
      kind: "publish",
      outcome: "success",
      createdAt: new Date(new Date(started.startedAt).getTime() + 1000).toISOString(),
      storeRelease: { provider: "google-play" },
      projectName: "VictoryTrack",
      version: "1.0.1",
      build: 5,
    });

    const completed = UsabilityTestService.finish();
    expect(completed).toMatchObject({
      googlePlaySuccess: true,
      successfulProjectName: "VictoryTrack",
      successfulVersion: "1.0.1",
      successfulBuild: 5,
    });
  });

  it("produit un rapport lisible avec les frottements", async () => {
    const { UsabilityTestService } = await import("./service");
    UsabilityTestService.start("Marie");
    UsabilityTestService.record("confusion", "/version", "Je ne sais pas quoi choisir");
    const report = UsabilityTestService.report();

    expect(report).toMatch(/Testeur : Marie/);
    expect(report).toMatch(/INCOMPRÉHENSION · \/version/);
    expect(report).toMatch(/Je ne sais pas quoi choisir/);
  });
});
