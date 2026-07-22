import { bridge } from "@/core/bridge";
import { ProfilesStore } from "../storage/profiles-store";
import { parseKeytoolListOutput } from "./keystore-inspector";
import type {
  SigningProfile,
  SigningValidationResult,
} from "../types/signing-profile";

/**
 * Validation d'un profil de signature. Utilisée :
 *  - à la demande depuis l'écran « Santé des signatures » ;
 *  - automatiquement avant chaque build release (preflight).
 *
 * Le mot de passe est relu depuis le trousseau système. Aucun secret
 * n'est retourné à l'appelant : uniquement `ok` + un message pédagogique.
 */

export const SigningValidator = {
  async validate(profileId: string): Promise<SigningValidationResult> {
    const b = bridge();
    const profile = ProfilesStore.get(profileId);
    if (!profile) {
      return {
        code: "unknown",
        ok: false,
        title: "Profil introuvable",
        message: "Le profil de signature demandé n'existe plus.",
      };
    }

    const exists = await b.fs.exists(profile.keystorePath).catch(() => false);
    if (!exists) {
      return {
        code: "file-missing",
        ok: false,
        title: "Fichier introuvable",
        message: `Le fichier « ${profile.keystorePath} » n'existe plus à cet emplacement.`,
      };
    }

    const support = await b.secrets.supported();
    if (!support.available) {
      return {
        code: "keychain-unavailable",
        ok: false,
        title: "Trousseau indisponible",
        message: support.reason ?? "Le trousseau système n'est pas disponible sur cette plateforme.",
      };
    }

    const storepass = await b.secrets.get(profile.id, "storepass");
    if (!storepass) {
      return {
        code: "keychain-missing",
        ok: false,
        title: "Mot de passe absent",
        message: "Le mot de passe du keystore n'est plus dans le trousseau. Ré-importez la signature pour restaurer l'accès.",
      };
    }

    const res = await b.signing.keystoreList({
      keystorePath: profile.keystorePath,
      storepass,
      alias: profile.alias,
    });
    if (!res.ok) {
      const map: Record<string, SigningValidationResult> = {
        "wrong-password": {
          code: "wrong-password",
          ok: false,
          title: "Mot de passe invalide",
          message: "Le mot de passe stocké dans le trousseau ne correspond plus au keystore.",
        },
        "alias-not-found": {
          code: "alias-not-found",
          ok: false,
          title: "Alias absent",
          message: `L'alias « ${profile.alias} » n'existe plus dans le keystore.`,
        },
        "invalid-keystore": {
          code: "invalid-keystore",
          ok: false,
          title: "Keystore invalide",
          message: "Le fichier n'est plus reconnu comme un keystore Android valide.",
        },
        "file-missing": {
          code: "file-missing",
          ok: false,
          title: "Fichier introuvable",
          message: "Le fichier keystore est introuvable.",
        },
        "keytool-missing": {
          code: "keytool-missing",
          ok: false,
          title: "keytool introuvable",
          message: "Installez un JDK 17+ pour permettre la validation.",
        },
      };
      return (
        map[res.errorCode ?? "unknown"] ?? {
          code: "unknown",
          ok: false,
          title: "Validation impossible",
          message: "La signature n'a pas pu être validée.",
        }
      );
    }

    const certificate = res.stdout ? parseKeytoolListOutput(res.stdout) ?? undefined : undefined;
    if (!certificate) {
      return {
        code: "certificate-unreadable",
        ok: false,
        title: "Certificat illisible",
        message: "Le keystore s'ouvre mais son certificat est illisible.",
      };
    }

    ProfilesStore.update(profile.id, {
      certificate,
      lastValidatedAt: new Date().toISOString(),
    });

    return {
      code: "ok",
      ok: true,
      title: "Signature valide",
      message: "Le mot de passe, l'alias et le certificat sont accessibles.",
      certificate,
    };
  },

  /**
   * Enregistre l'utilisation d'un profil (mise à jour de `lastUsedAt`).
   * Aucun secret impliqué — appelé par le pipeline de build après signature.
   */
  markUsed(profileId: string): SigningProfile | undefined {
    return ProfilesStore.update(profileId, { lastUsedAt: new Date().toISOString() });
  },
};
