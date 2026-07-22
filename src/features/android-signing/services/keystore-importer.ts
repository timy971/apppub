import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";
import { ProfilesStore } from "../storage/profiles-store";
import { parseKeytoolListOutput } from "./keystore-inspector";
import type {
  SigningProfile,
  SigningValidationResult,
} from "../types/signing-profile";

/**
 * Import d'un keystore existant. Séquence :
 *  1. valide le fichier ;
 *  2. exécute `keytool -list -v` pour vérifier le mot de passe + l'alias ;
 *  3. persiste le mot de passe dans le Keychain (macOS uniquement) ;
 *  4. crée un SigningProfile (sans secret) et le stocke localement.
 *
 * Retourne un `SigningValidationResult` ; en cas de succès, `profile` est
 * renseigné et le mot de passe n'a jamais quitté ce fichier ni le
 * process Electron principal.
 */

export interface ImportKeystoreInput {
  name: string;
  keystorePath: string;
  alias: string;
  storepass: string;
}

export interface ImportKeystoreOutput extends SigningValidationResult {
  profile?: SigningProfile;
  /**
   * true si le mot de passe a été écrit dans le trousseau système.
   * false si le trousseau n'est pas disponible (Windows / Linux) — le
   * profil est tout de même créé mais l'utilisateur devra ressaisir le
   * mot de passe à chaque build.
   */
  secretStored: boolean;
}

function detectStoreType(path: string): "JKS" | "PKCS12" {
  return path.toLowerCase().endsWith(".jks") ? "JKS" : "PKCS12";
}

export const KeystoreImporter = {
  async import(input: ImportKeystoreInput): Promise<ImportKeystoreOutput> {
    const b = bridge();
    const trimmed: ImportKeystoreInput = {
      name: input.name.trim(),
      keystorePath: input.keystorePath.trim(),
      alias: input.alias.trim(),
      storepass: input.storepass, // ne jamais trim un mot de passe
    };
    if (!trimmed.name || !trimmed.keystorePath || !trimmed.alias || !trimmed.storepass) {
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Informations incomplètes",
        message: "Renseignez le nom, le fichier, l'alias et le mot de passe.",
      };
    }

    const res = await b.signing.keystoreList({
      keystorePath: trimmed.keystorePath,
      storepass: trimmed.storepass,
      alias: trimmed.alias,
    });

    if (!res.ok) {
      switch (res.errorCode) {
        case "file-missing":
          return {
            code: "file-missing",
            ok: false,
            secretStored: false,
            title: "Fichier introuvable",
            message: "Le fichier keystore est introuvable ou n'a pas été autorisé.",
          };
        case "wrong-password":
          return {
            code: "wrong-password",
            ok: false,
            secretStored: false,
            title: "Mot de passe incorrect",
            message: "Le mot de passe du keystore ne permet pas de l'ouvrir.",
          };
        case "alias-not-found":
          return {
            code: "alias-not-found",
            ok: false,
            secretStored: false,
            title: "Alias introuvable",
            message: `L'alias « ${trimmed.alias} » n'existe pas dans ce keystore.`,
          };
        case "invalid-keystore":
          return {
            code: "invalid-keystore",
            ok: false,
            secretStored: false,
            title: "Keystore invalide",
            message: "Le fichier n'est pas reconnu comme un keystore Android valide.",
          };
        case "keytool-missing":
          return {
            code: "keytool-missing",
            ok: false,
            secretStored: false,
            title: "keytool introuvable",
            message: "Installez un JDK 17+ ou définissez JAVA_HOME pour permettre la validation des signatures.",
          };
        default:
          return {
            code: "unknown",
            ok: false,
            secretStored: false,
            title: "Erreur inattendue",
            message: "Impossible de lire ce keystore. Vérifiez le fichier, l'alias et le mot de passe.",
          };
      }
    }

    const certificate = res.stdout ? parseKeytoolListOutput(res.stdout) ?? undefined : undefined;
    if (!certificate) {
      return {
        code: "certificate-unreadable",
        ok: false,
        secretStored: false,
        title: "Certificat illisible",
        message: "Le keystore s'ouvre mais son certificat n'a pas pu être analysé.",
      };
    }

    // 1) Crée le profil (sans secret).
    const profile = ProfilesStore.create({
      name: trimmed.name,
      keystorePath: trimmed.keystorePath,
      alias: trimmed.alias,
      storeType: detectStoreType(trimmed.keystorePath),
      certificate,
      secureStorage: "unavailable", // sera ajusté ci-dessous
      lastValidatedAt: new Date().toISOString(),
    });

    // 2) Stocke le mot de passe dans le trousseau, si disponible.
    const support = await b.secrets.supported();
    let secretStored = false;
    if (support.available) {
      secretStored = await b.secrets.set(profile.id, "storepass", trimmed.storepass);
    }
    ProfilesStore.update(profile.id, {
      secureStorage: secretStored ? "system-keychain" : "unavailable",
    });

    JournalService.log("info", "Signature importée", {
      profileId: profile.id,
      profileName: profile.name,
      alias: profile.alias,
      sha256: certificate.sha256,
      secretStored,
    });

    return {
      code: "ok",
      ok: true,
      secretStored,
      title: "Signature importée",
      message: secretStored
        ? "Le mot de passe est protégé par le trousseau système."
        : "Le profil est créé. Sans trousseau disponible, le mot de passe sera demandé à chaque build.",
      certificate,
      profile: ProfilesStore.get(profile.id),
    };
  },
};
