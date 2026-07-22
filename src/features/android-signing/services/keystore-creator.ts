import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";
import { ProfilesStore } from "../storage/profiles-store";
import { parseKeytoolListOutput } from "./keystore-inspector";
import type { SigningProfile, SigningValidationResult } from "../types/signing-profile";

/**
 * Création d'un nouveau keystore Android via `keytool -genkeypair`.
 * Le fichier est créé sur disque, puis relu pour extraire ses métadonnées,
 * puis un `SigningProfile` est persisté et les mots de passe sont écrits
 * dans le trousseau système lorsqu'il est disponible.
 */

export interface CreateKeystoreInput {
  name: string;
  outputFolder: string;
  fileName: string; // ex : "cranioscan-release.jks"
  alias: string;
  storepass: string;
  keypass: string;
  identity: {
    commonName: string;
    organization: string;
    city: string;
    country: string; // ISO 2 lettres
  };
  validityDays?: number;
}

export interface CreateKeystoreOutput extends SigningValidationResult {
  profile?: SigningProfile;
  keystorePath?: string;
  secretStored: boolean;
}

function escapeDnValue(v: string): string {
  return v.replace(/[",\\+<>;=]/g, (c) => `\\${c}`);
}

function buildDName(id: CreateKeystoreInput["identity"]): string {
  const parts: string[] = [];
  parts.push(`CN=${escapeDnValue(id.commonName)}`);
  parts.push(`O=${escapeDnValue(id.organization)}`);
  if (id.city) parts.push(`L=${escapeDnValue(id.city)}`);
  parts.push(`C=${escapeDnValue(id.country.toUpperCase())}`);
  return parts.join(", ");
}

function joinPath(folder: string, file: string): string {
  const trimmed = folder.replace(/[\\/]+$/, "");
  const sep = /[\\]/.test(trimmed) && !/\//.test(trimmed) ? "\\" : "/";
  return `${trimmed}${sep}${file}`;
}

export const KeystoreCreator = {
  async create(input: CreateKeystoreInput): Promise<CreateKeystoreOutput> {
    const b = bridge();
    const name = input.name.trim();
    const fileName = input.fileName.trim().replace(/[/\\]/g, "");
    const alias = input.alias.trim();
    if (!name || !input.outputFolder || !fileName || !alias) {
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Informations incomplètes",
        message: "Renseignez le nom, le dossier, le fichier et l'alias.",
      };
    }
    if (!/\.(jks|keystore)$/i.test(fileName)) {
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Extension invalide",
        message: "Le fichier doit se terminer par .jks ou .keystore.",
      };
    }
    if (input.storepass.length < 6 || input.keypass.length < 6) {
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Mot de passe trop court",
        message: "Choisissez des mots de passe d'au moins 6 caractères.",
      };
    }
    if (!input.identity.commonName || !input.identity.organization || !input.identity.country) {
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Identité incomplète",
        message: "Le nom, l'organisation et le pays du certificat sont obligatoires.",
      };
    }

    const keystorePath = joinPath(input.outputFolder, fileName);
    const dname = buildDName(input.identity);

    const created = await b.signing.keystoreCreate({
      keystorePath,
      alias,
      storepass: input.storepass,
      keypass: input.keypass,
      dname,
      validityDays: input.validityDays ?? 10_000,
    });

    if (!created.ok) {
      const hintByCode: Record<string, string> = {
        "file-exists": "Un fichier existe déjà à cet emplacement. Choisissez un autre nom.",
        "keytool-missing": "keytool est introuvable. Installez un JDK 17+.",
        "invalid-args": created.errorHint || "Vérifiez les informations saisies.",
      };
      return {
        code: "unknown",
        ok: false,
        secretStored: false,
        title: "Création impossible",
        message: hintByCode[created.errorCode ?? "unknown"] ?? "La création du keystore a échoué.",
      };
    }

    // Relit le keystore pour capturer le certificat effectif.
    const listed = await b.signing.keystoreList({
      keystorePath,
      storepass: input.storepass,
      alias,
    });
    const certificate = listed.ok && listed.stdout ? parseKeytoolListOutput(listed.stdout) ?? undefined : undefined;

    const profile = ProfilesStore.create({
      name,
      keystorePath,
      alias,
      storeType: fileName.toLowerCase().endsWith(".jks") ? "JKS" : "PKCS12",
      certificate,
      secureStorage: "unavailable",
      lastValidatedAt: certificate ? new Date().toISOString() : undefined,
    });

    const support = await b.secrets.supported();
    let secretStored = false;
    if (support.available) {
      const s1 = await b.secrets.set(profile.id, "storepass", input.storepass);
      const s2 = await b.secrets.set(profile.id, "keypass", input.keypass);
      secretStored = s1 && s2;
    }
    ProfilesStore.update(profile.id, {
      secureStorage: secretStored ? "system-keychain" : "unavailable",
    });

    JournalService.log("info", "Signature créée", {
      profileId: profile.id,
      profileName: profile.name,
      alias: profile.alias,
      sha256: certificate?.sha256,
      secretStored,
    });

    return {
      code: "ok",
      ok: true,
      secretStored,
      keystorePath,
      profile: ProfilesStore.get(profile.id),
      certificate,
      title: "Signature créée",
      message: secretStored
        ? "Le fichier a été généré et les mots de passe sont dans le trousseau système. Pensez à sauvegarder ce fichier en lieu sûr — sans lui, aucune mise à jour de votre application ne sera plus possible sur le Play Store."
        : "Le fichier a été généré. Sauvegardez-le en lieu sûr immédiatement — sans lui, aucune mise à jour de votre application ne sera plus possible sur le Play Store.",
    };
  },
};
