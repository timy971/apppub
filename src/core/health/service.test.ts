import { describe, expect, it } from "vitest";
import { HealthScoreService } from "./service";
import type { HealthCheck } from "@/core/types";

const ok = (id: string, w = 1): HealthCheck => ({ id, label: id, status: "ok", weight: w });
const warn = (id: string, w = 1): HealthCheck => ({ id, label: id, status: "warning", weight: w });
const err = (id: string, w = 1): HealthCheck => ({ id, label: id, status: "error", weight: w });

describe("HealthScoreService", () => {
  it("retourne 100 quand tout est vert", () => {
    const s = HealthScoreService.from([ok("a"), ok("b")]);
    expect(s.score).toBe(100);
    expect(s.grade).toBe("excellent");
  });
  it("bloque dès qu'il y a une erreur", () => {
    const s = HealthScoreService.from([ok("a"), err("b")]);
    expect(s.grade).toBe("blocked");
  });
  it("pondère les warnings", () => {
    const s = HealthScoreService.from([ok("a"), warn("b")]);
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBeLessThan(100);
  });
  it("expose les 3 premiers points d'attention", () => {
    const s = HealthScoreService.from([warn("a"), warn("b"), warn("c"), warn("d")]);
    expect(s.highlights.length).toBe(3);
  });
});
