import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { getAndroidConfig } from "@/core/projects/android-config";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";

/**
 * Signing Injector — pont unique entre le SigningProfile (source de vérité)
 * et Gradle. Aucun mot de passe n'est écrit sur disque : les secrets
 * lus depuis le trousseau système transitent uniquement via des variables
 * d'environnement `ORG_GRADLE_PROJECT_*` passées au process enfant Gradle.
 *
 *  - `ensureGradlePatched()` ajoute (idempotemment) au `app/build.gradle`
 *    un bloc `signingConfigs.appPublisherRelease` gardé par `hasProperty`.
 *    Si les propriétés Gradle ne sont pas fournies, le bloc reste inerte :
 *    aucun risque de casser un build existant.
 *  - `prepare(project)` lit le profil lié, récupère les mots de passe
 *    dans le trousseau et retourne l'environnement à injecter dans Gradle.
 *
 * INVARIANT : le renderer ne voit jamais les mots de passe (uniquement le
 * champ `env` passé à `exec.run`, filtré par le main process).
 */

const MARKER_BEGIN = "// >>> AppPublisher managed signing config — do not edit";
const MARKER_END = "// <<< AppPublisher managed signing config";

const GRADLE_PATCH = `
${MARKER_BEGIN}
android {
    signingConfigs {
        appPublisherRelease {
            if (project.hasProperty('APP_KEYSTORE_FILE')) {
                storeFile file(APP_KEYSTORE_FILE)
                storePassword APP_KEYSTORE_PASSWORD
                keyAlias APP_KEY_ALIAS
                keyPassword APP_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            if (project.hasProperty('APP_KEYSTORE_FILE')) {
                signingConfig signingConfigs.appPublisherRelease
            }
        }
    }
}
${MARKER_END}
`;

export type PatchStatus = "already-patched" | "patched" | "gradle-missing" | "write-failed";

export interface GradleSigningInspection {
  hasMarker: boolean;
  hasAppPublisherRelease: boolean;
  signingConfigs: string[];
  releaseAssignments: string[];
  legacyStoreFiles: string[];
  releaseUsesAppPublisher: boolean;
}

export interface GradlePatchResult {
  status: PatchStatus;
  gradlePath: string;
  exists: boolean;
  inspection: GradleSigningInspection;
}

export interface SigningPreparation {
  profileId: string;
  profileName: string;
  alias: string;
  keystorePath: string;
  /** Variables d'environnement à injecter au process Gradle. */
  env: Record<string, string>;
}

export interface SigningPrepareError {
  code: "no-profile-linked" | "profile-missing" | "keychain-missing" | "storepass-missing";
  message: string;
}

export const SigningInjector = {
  markerBegin: MARKER_BEGIN,

  /**
   * Applique le patch signing dans `<android>/app/build.gradle` s'il ne l'est
   * pas déjà. Renvoie l'état de l'opération pour affichage dans les logs.
   */
  inspect(content: string): GradleSigningInspection {
    const signingConfigs = [...content.matchAll(/(?:create\s*\(\s*["']([^"']+)["']\s*\)|\b([A-Za-z][\w]*)\s*\{)/g)]
      .map((match) => match[1] ?? match[2])
      .filter((name) => name === "release" || name === "appPublisherRelease");
    const releaseAssignments = [...content.matchAll(/signingConfig\s+(?:=\s*)?signingConfigs(?:\.([A-Za-z][\w]*)|\[['"]([^'"]+)['"]\])/g)]
      .map((match) => match[1] ?? match[2])
      .filter((name): name is string => Boolean(name));
    const legacyStoreFiles = [...content.matchAll(/storeFile\s+file\s*\(([^\n)]+)\)/g)]
      .map((match) => match[1].trim())
      .filter((value) => !/APP_KEYSTORE_FILE/.test(value));
    return {
      hasMarker: content.includes(MARKER_BEGIN) && content.includes(MARKER_END),
      hasAppPublisherRelease: /\bappPublisherRelease\s*\{/.test(content),
      signingConfigs: [...new Set(signingConfigs)],
      releaseAssignments,
      legacyStoreFiles,
      releaseUsesAppPublisher: releaseAssignments.at(-1) === "appPublisherRelease",
    };
  },

  async ensureGradlePatched(androidDir: string): Promise<GradlePatchResult> {
    const b = bridge();
    const gradlePath = `${androidDir}/app/build.gradle`;
    const content = await b.fs.readText(gradlePath);
    if (content == null) {
      return { status: "gradle-missing", gradlePath, exists: false, inspection: this.inspect("") };
    }
    const markerPattern = new RegExp(`${MARKER_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "g");
    const withoutManaged = content.replace(markerPattern, "").replace(/\s*$/, "");
    const next = `${withoutManaged}\n${GRADLE_PATCH}\n`;
    const unchanged = next === content;
    if (unchanged) {
      return { status: "already-patched", gradlePath, exists: true, inspection: this.inspect(content) };
    }
    const ok = await b.fs.writeText(gradlePath, next);
    const written = ok ? await b.fs.readText(gradlePath) : null;
    const inspection = this.inspect(written ?? "");
    return {
      status: ok && written === next ? "patched" : "write-failed",
      gradlePath,
      exists: true,
      inspection,
    };
  },

  /**
   * Prépare les variables d'environnement à passer à Gradle. Retourne une
   * union discriminée pour permettre à l'appelant d'afficher un message
   * pédagogique clair et de refuser le build si la préparation échoue.
   */
  async prepare(
    project: Project,
  ): Promise<
    | { ok: true; preparation: SigningPreparation }
    | { ok: false; error: SigningPrepareError }
  > {
    const cfg = getAndroidConfig(project);
    if (!cfg.signingProfileId) {
      return {
        ok: false,
        error: {
          code: "no-profile-linked",
          message:
            "Aucun profil de signature n'est associé à ce projet. Ouvrez la fiche du projet pour en lier un.",
        },
      };
    }
    const profile = ProfilesStore.get(cfg.signingProfileId);
    if (!profile) {
      return {
        ok: false,
        error: {
          code: "profile-missing",
          message: "Le profil de signature associé au projet est introuvable.",
        },
      };
    }
    if (!profile.alias.trim()) {
      return {
        ok: false,
        error: { code: "profile-missing", message: "L'alias du profil de signature est vide. Modifiez le profil avant de relancer." },
      };
    }
    const b = bridge();
    const resolved = await b.signing.resolveKeystore({
      storedPath: profile.keystorePath,
      projectPath: project.localPath,
    });
    if (!resolved.ok || !resolved.resolvedPath) {
      const tested = resolved.testedPaths.map((value) => `- ${value}`).join("\n");
      const ambiguity = resolved.candidates?.length
        ? `\nFichiers trouvés :\n${resolved.candidates.map((value) => `- ${value}`).join("\n")}\nAction : sélectionnez explicitement le bon fichier dans le profil de signature.`
        : `\nAction : sélectionnez de nouveau le fichier keystore dans le profil de signature.`;
      return {
        ok: false,
        error: {
          code: "profile-missing",
          message: `Keystore introuvable ou ambigu.\nChemin enregistré : ${profile.keystorePath}\nEmplacements testés :\n${tested}${ambiguity}`,
        },
      };
    }
    const support = await b.secrets.supported();
    if (!support.available) {
      return {
        ok: false,
        error: {
          code: "keychain-missing",
          message:
            support.reason ??
            "Le trousseau système n'est pas disponible : impossible de récupérer le mot de passe.",
        },
      };
    }
    const storepass = await b.secrets.get(profile.id, "storepass");
    if (!storepass) {
      return {
        ok: false,
        error: {
          code: "storepass-missing",
          message:
            "Le mot de passe du keystore est absent du trousseau. Ré-importez la signature pour restaurer l'accès.",
        },
      };
    }
    // keypass optionnel : par défaut identique à storepass (comportement
    // usuel des keystores générés par keytool sans keypass distinct).
    const keypass = (await b.secrets.get(profile.id, "keypass")) ?? storepass;

    return {
      ok: true,
      preparation: {
        profileId: profile.id,
        profileName: profile.name,
        alias: profile.alias,
        keystorePath: resolved.resolvedPath,
        env: {
          ORG_GRADLE_PROJECT_APP_KEYSTORE_FILE: resolved.resolvedPath,
          ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD: storepass,
          ORG_GRADLE_PROJECT_APP_KEY_ALIAS: profile.alias,
          ORG_GRADLE_PROJECT_APP_KEY_PASSWORD: keypass,
        },
      },
    };
  },
};
