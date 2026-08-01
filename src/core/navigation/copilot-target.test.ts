import { describe, expect, it } from "vitest";

import { resolveCopilotTarget } from "./copilot-target";

describe("resolveCopilotTarget", () => {
  it("conserve une route statique connue", () => {
    expect(resolveCopilotTarget({ route: "/build" }, "p1")).toEqual({ to: "/build" });
  });

  it("injecte le projet, l'onglet et le champ dans une route cockpit", () => {
    expect(
      resolveCopilotTarget(
        {
          route: "/projects/$id",
          cockpitTab: "publishing",
          cockpitField: "android.applicationId",
        },
        "project-42",
      ),
    ).toEqual({
      to: "/projects/$id",
      params: { id: "project-42" },
      search: { tab: "publishing", field: "android.applicationId" },
    });
  });

  it("revient à la liste si aucun projet ne peut résoudre $id", () => {
    expect(resolveCopilotTarget({ route: "/projects/$id" })).toEqual({
      to: "/projects",
    });
  });

  it("neutralise une destination inconnue", () => {
    expect(resolveCopilotTarget({ route: "/page-inexistante" }, "p1")).toEqual({
      to: "/",
    });
  });
});
