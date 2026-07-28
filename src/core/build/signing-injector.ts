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
  async ensureGradlePatched(androidDir: string): Promise<PatchStatus> {
    const b = bridge();
    const gradlePath = `${androidDir}/app/build.gradle`;
    const content = await b.fs.readText(gradlePath);
    if (content == null) return "gradle-missing";
    if (content.includes(MARKER_BEGIN)) return "already-patched";
    const next = content.replace(/\s*$/, "") + "\n" + GRADLE_PATCH + "\n";
    const ok = await b.fs.writeText(gradlePath, next);
    return ok ? "patched" : "write-failed";
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
    const b = bridge();
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
        keystorePath: profile.keystorePath,
        env: {
          ORG_GRADLE_PROJECT_APP_KEYSTORE_FILE: profile.keystorePath,
          ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD: storepass,
          ORG_GRADLE_PROJECT_APP_KEY_ALIAS: profile.alias,
          ORG_GRADLE_PROJECT_APP_KEY_PASSWORD: keypass,
        },
      },
    };
  },
};
