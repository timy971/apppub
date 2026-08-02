import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  keystoreList: vi.fn(),
}));

vi.mock("@/core/bridge", () => ({
  bridge: () => ({
    signing: { keystoreList: mocks.keystoreList },
  }),
}));

vi.mock("@/core/journal/logger", () => ({
  JournalService: { log: vi.fn() },
}));

vi.mock("../storage/profiles-store", () => ({
  ProfilesStore: {},
}));

import { KeystoreImporter } from "./keystore-importer";

describe("KeystoreImporter.detectAliases", () => {
  beforeEach(() => {
    mocks.keystoreList.mockReset();
  });

  it("lit tout le keystore sans exiger d'alias", async () => {
    mocks.keystoreList.mockResolvedValue({
      ok: true,
      stdout: `
Alias name: release
Entry type: PrivateKeyEntry
`,
    });

    const result = await KeystoreImporter.detectAliases({
      keystorePath: " /keys/release.jks ",
      storepass: "secret123",
    });

    expect(mocks.keystoreList).toHaveBeenCalledWith({
      keystorePath: "/keys/release.jks",
      storepass: "secret123",
    });
    expect(result).toMatchObject({ ok: true, aliases: ["release"] });
  });

  it("propose toutes les clés privées lorsque plusieurs alias existent", async () => {
    mocks.keystoreList.mockResolvedValue({
      ok: true,
      stdout: `
Nom d'alias : cranioscan
Type d'entrée : PrivateKeyEntry

Nom d'alias : victorytrack
Type d'entrée : PrivateKeyEntry
`,
    });

    const result = await KeystoreImporter.detectAliases({
      keystorePath: "/keys/apps.jks",
      storepass: "secret123",
    });

    expect(result).toMatchObject({
      ok: true,
      aliases: ["cranioscan", "victorytrack"],
      title: "Clés détectées",
    });
  });

  it("traduit un mauvais mot de passe sans exposer la sortie de keytool", async () => {
    mocks.keystoreList.mockResolvedValue({
      ok: false,
      errorCode: "wrong-password",
    });

    const result = await KeystoreImporter.detectAliases({
      keystorePath: "/keys/release.jks",
      storepass: "incorrect",
    });

    expect(result).toEqual({
      aliases: [],
      code: "wrong-password",
      ok: false,
      title: "Mot de passe incorrect",
      message: "Le mot de passe du keystore ne permet pas de l'ouvrir.",
    });
  });

  it("refuse un keystore qui ne contient qu'un certificat", async () => {
    mocks.keystoreList.mockResolvedValue({
      ok: true,
      stdout: `
Alias name: certificate-only
Entry type: trustedCertEntry
`,
    });

    const result = await KeystoreImporter.detectAliases({
      keystorePath: "/keys/certificates.jks",
      storepass: "secret123",
    });

    expect(result).toMatchObject({
      aliases: [],
      code: "no-signing-alias",
      ok: false,
      title: "Aucune clé de signature",
    });
  });
});
