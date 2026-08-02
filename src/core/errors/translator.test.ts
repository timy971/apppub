import { describe, expect, it } from "vitest";
import { translateError } from "./translator";

describe("translateError", () => {
  it("explique comment réparer une association de signature obsolète", () => {
    const t = translateError(
      "Le profil de signature associé au projet est introuvable. Réassociez une signature dans la fiche du projet avant de relancer.",
    );
    expect(t.title).toBe("Signature à réassocier");
    expect(t.explanation).toMatch(/keystore n'a pas été supprimé/i);
    expect(t.solution).toMatch(/Publication.*Signature associée/i);
  });

  it("traduit ENOENT sur version.mjs en message ciblé", () => {
    const t = translateError("Error: ENOENT: no such file scripts/version.mjs");
    expect(t.title).toMatch(/script de version/i);
    expect(t.solution).toBeTruthy();
    expect(t.retryable).toBe(true);
  });

  it("détecte l'absence de Node.js", () => {
    const t = translateError("command not found: node");
    expect(t.title).toMatch(/Node/);
  });

  it("détecte l'absence du SDK Android", () => {
    const t = translateError("SDK location not found. Define location with ANDROID_HOME");
    expect(t.title).toMatch(/SDK Android/);
  });

  it("détecte les problèmes réseau", () => {
    const t = translateError({ code: "ETIMEDOUT", message: "timeout" });
    expect(t.title).toMatch(/Internet/);
  });

  it("retourne un message générique pour une erreur inconnue", () => {
    const t = translateError("~~~ complètement inconnu ~~~");
    expect(t.title).toMatch(/inattendue/);
    expect(t.retryable).toBe(true);
  });
});
