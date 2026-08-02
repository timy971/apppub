import { describe, expect, it } from "vitest";
import { parseKeytoolListOutput } from "./keystore-inspector";

describe("parseKeytoolListOutput", () => {
  it("analyse la sortie française même lorsque la date contient le mois Aug", () => {
    const output = `
Nom d'alias : release
Date de création : 2 août 2026
Type d'entrée : PrivateKeyEntry
Longueur de chaîne du certificat : 1
Certificat[1]:
Propriétaire : CN=Test, O=AppPublisher, L=Paris, C=FR
Emetteur : CN=Test, O=AppPublisher, L=Paris, C=FR
Numéro de série : 77405410d8663e5e
Valide du Sun Aug 02 09:58:34 CEST 2026 au Thu Dec 18 08:58:34 CET 2053
Empreintes du certificat :
  SHA 1: 4E:DC:8B:29:90:33:82:79:01:01:EE:4C:2E:DC:ED:59:7A:80:4F:9B
  SHA 256: FF:57:39:2B:EB:E3:A8:F7:68:7F:61:6B:66:F4:4A:42:FB:3E:F1:F3:29:3D:2D:CB:E4:51:AD:4F:AF:57:87:D3
Nom de l'algorithme de signature : SHA256withRSA
`;

    expect(parseKeytoolListOutput(output)).toEqual({
      subject: "CN=Test, O=AppPublisher, L=Paris, C=FR",
      issuer: "CN=Test, O=AppPublisher, L=Paris, C=FR",
      validFrom: "2026-08-02T09:58:34.000Z",
      validUntil: "2053-12-18T08:58:34.000Z",
      sha256:
        "FF:57:39:2B:EB:E3:A8:F7:68:7F:61:6B:66:F4:4A:42:FB:3E:F1:F3:29:3D:2D:CB:E4:51:AD:4F:AF:57:87:D3",
      sha1: "4E:DC:8B:29:90:33:82:79:01:01:EE:4C:2E:DC:ED:59:7A:80:4F:9B",
      algorithm: "SHA256withRSA",
      serialNumber: "77405410d8663e5e",
    });
  });

  it("analyse aussi la sortie anglaise", () => {
    const output = `
Owner: CN=Test, O=AppPublisher, L=Paris, C=FR
Issuer: CN=Test, O=AppPublisher, L=Paris, C=FR
Serial number: 1234abcd
Valid from: Sun Aug 02 09:58:34 CEST 2026 until: Thu Dec 18 08:58:34 CET 2053
Certificate fingerprints:
  SHA1: AA:BB:CC
  SHA256: 11:22:33
Signature algorithm name: SHA256withRSA
`;

    expect(parseKeytoolListOutput(output)).toMatchObject({
      validFrom: "2026-08-02T09:58:34.000Z",
      validUntil: "2053-12-18T08:58:34.000Z",
      sha256: "11:22:33",
    });
  });
});
