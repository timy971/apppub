import { describe, expect, it } from "vitest";
import {
  capacitorInstall,
  CERTIFIED_CAPACITOR_VERSION,
  dependencyInstall,
  webBuild,
} from "./service";

const packages = [
  `@capacitor/cli@${CERTIFIED_CAPACITOR_VERSION}`,
  `@capacitor/android@${CERTIFIED_CAPACITOR_VERSION}`,
  `@capacitor/core@${CERTIFIED_CAPACITOR_VERSION}`,
];

describe("CapacitorService — commandes de préparation", () => {
  it("verrouille les trois composants sur la version certifiée", () => {
    expect(CERTIFIED_CAPACITOR_VERSION).toBe("7.6.8");
    expect(capacitorInstall("npm")).toEqual({
      cmd: "npm",
      args: ["install", "--save-exact", ...packages],
    });
    expect(capacitorInstall("pnpm")).toEqual({
      cmd: "pnpm",
      args: ["add", "--save-exact", ...packages],
    });
    expect(capacitorInstall("yarn")).toEqual({
      cmd: "yarn",
      args: ["add", "--exact", ...packages],
    });
    expect(capacitorInstall("bun")).toEqual({
      cmd: "bun",
      args: ["add", "--exact", ...packages],
    });
  });

  it("conserve les commandes exactes d’installation et de build web", () => {
    expect(dependencyInstall("npm")).toEqual({ cmd: "npm", args: ["install"] });
    expect(webBuild("npm")).toEqual({ cmd: "npm", args: ["run", "build"] });
    expect(webBuild("yarn")).toEqual({ cmd: "yarn", args: ["build"] });
  });
});
