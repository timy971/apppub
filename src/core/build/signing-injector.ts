import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { getAndroidConfig } from "@/core/projects/android-config";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";

/**
 * Signing Injector — pont unique entre le SigningProfile (source de vérité)
 * et Gradle. Aucun mot de passe n'est écrit sur disque : les secrets
 * restent dans le processus principal. Le renderer ne reçoit qu'un jeton
 * opaque, mono-usage, que le main process échange contre l'environnement
 * `ORG_GRADLE_PROJECT_*` au lancement de Gradle.
 *
 *  - `ensureGradlePatched()` ajoute (idempotemment) au `app/build.gradle`
 *    un bloc `signingConfigs.appPublisherRelease` gardé par `hasProperty`.
 *    Si les propriétés Gradle ne sont pas fournies, le bloc reste inerte :
 *    aucun risque de casser un build existant.
 *  - `prepare(project)` lit le profil lié, récupère les mots de passe
 *    dans le trousseau et retourne l'environnement à injecter dans Gradle.
 *
 * INVARIANT : le renderer ne reçoit jamais les mots de passe du trousseau.
 */

const MARKER_BEGIN = "// >>> AppPublisher managed signing config — do not edit";
const MARKER_END = "// <<< AppPublisher managed signing config";

export type PatchStatus = "already-patched" | "patched" | "gradle-missing" | "write-failed";

export interface GradleSigningInspection {
  hasMarker: boolean;
  hasAppPublisherRelease: boolean;
  signingConfigs: string[];
  releaseAssignments: string[];
  legacyStoreFiles: string[];
  releaseUsesAppPublisher: boolean;
  hasDeferredSigningOverride: boolean;
}

export interface GradlePatchResult {
  status: PatchStatus;
  gradlePath: string;
  exists: boolean;
  inspection: GradleSigningInspection;
  errorCode?: string;
}

export interface SigningPreparation {
  profileId: string;
  profileName: string;
  alias: string;
  keystorePath: string;
  storedKeystorePath: string;
  storedPathWasAbsolute: boolean;
  testedKeystorePaths: string[];
  /** Jeton opaque, mono-usage, lié au projet et à la fenêtre Electron. */
  signingSessionId: string;
}

export interface SigningPrepareError {
  code:
    | "no-profile-linked"
    | "profile-missing"
    | "keychain-missing"
    | "storepass-missing"
    | "session-failed";
  message: string;
}

export const SigningInjector = {
  markerBegin: MARKER_BEGIN,

  /**
   * Applique le patch signing dans `<android>/app/build.gradle` s'il ne l'est
   * pas déjà. Renvoie l'état de l'opération pour affichage dans les logs.
   */
  inspect(content: string): GradleSigningInspection {
    const signingConfigs = [
      ...content.matchAll(/(?:create\s*\(\s*["']([^"']+)["']\s*\)|\b([A-Za-z][\w]*)\s*\{)/g),
    ]
      .map((match) => match[1] ?? match[2])
      .filter((name) => name === "release" || name === "appPublisherRelease");
    const releaseAssignments = [
      ...content.matchAll(
        /signingConfig\s+(?:=\s*)?signingConfigs(?:\.([A-Za-z][\w]*)|\[['"]([^'"]+)['"]\])/g,
      ),
    ]
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
      hasDeferredSigningOverride: /afterEvaluate\s*\{[\s\S]*?signingConfig/.test(content),
    };
  },

  async ensureGradlePatched(androidDir: string): Promise<GradlePatchResult> {
    const b = bridge();
    const gradlePath = `${androidDir}/app/build.gradle`;
    const content = await b.fs.readText(gradlePath);
    if (content == null) {
      return { status: "gradle-missing", gradlePath, exists: false, inspection: this.inspect("") };
    }
    const patched = await b.gradle.ensureSigningPatch(androidDir);
    const written = patched.ok ? await b.fs.readText(gradlePath) : null;
    const inspection = this.inspect(written ?? "");
    return {
      status: patched.ok ? (patched.changed ? "patched" : "already-patched") : "write-failed",
      gradlePath,
      exists: true,
      inspection,
      errorCode: patched.errorCode,
    };
  },

  /**
   * Prépare une session de signature opaque à passer à Gradle. Retourne une
   * union discriminée pour permettre à l'appelant d'afficher un message
   * pédagogique clair et de refuser le build si la préparation échoue.
   */
  async prepare(
    project: Project,
  ): Promise<
    { ok: true; preparation: SigningPreparation } | { ok: false; error: SigningPrepareError }
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
        error: {
          code: "profile-missing",
          message: "L'alias du profil de signature est vide. Modifiez le profil avant de relancer.",
        },
      };
    }
    const b = bridge();
    const prepared = await b.signing.prepareBuild({
      profileId: profile.id,
      keystorePath: profile.keystorePath,
      alias: profile.alias,
      projectPath: project.localPath,
    });
    if (!prepared.ok) {
      const messages: Record<string, SigningPrepareError> = {
        "profile-mismatch": {
          code: "profile-missing",
          message:
            "Le profil lié au projet ne correspond plus aux données enregistrées. Reliez de nouveau la signature au projet.",
        },
        "project-not-authorized": {
          code: "profile-missing",
          message:
            "Le dossier du projet n'est plus autorisé. Sélectionnez-le de nouveau avec le bouton Parcourir.",
        },
        "file-missing": {
          code: "profile-missing",
          message:
            "Le keystore est introuvable. Sélectionnez de nouveau le fichier dans le profil de signature.",
        },
        "keychain-unavailable": {
          code: "keychain-missing",
          message:
            prepared.errorHint ??
            "Le trousseau système n'est pas disponible : impossible de préparer la signature.",
        },
        "keychain-missing": {
          code: "storepass-missing",
          message:
            "Le mot de passe du keystore est absent du trousseau. Ré-importez la signature pour restaurer l'accès.",
        },
        "wrong-password": {
          code: "storepass-missing",
          message:
            "Le mot de passe stocké ne correspond plus au keystore. Ré-importez la signature.",
        },
        "alias-not-found": {
          code: "profile-missing",
          message: `L'alias « ${profile.alias} » n'existe plus dans le keystore.`,
        },
        "invalid-keystore": {
          code: "profile-missing",
          message: "Le fichier sélectionné n'est plus un keystore Android valide.",
        },
        "keytool-missing": {
          code: "profile-missing",
          message: "keytool est introuvable. Installez un JDK 17 ou plus récent.",
        },
        "session-failed": {
          code: "session-failed",
          message: "La session de signature n'a pas pu être créée. Relancez le build.",
        },
      };
      return {
        ok: false,
        error:
          messages[prepared.errorCode] ??
          ({
            code: "session-failed",
            message: prepared.errorHint ?? "La signature n'a pas pu être préparée.",
          } satisfies SigningPrepareError),
      };
    }

    return {
      ok: true,
      preparation: {
        profileId: profile.id,
        profileName: profile.name,
        alias: profile.alias,
        keystorePath: prepared.keystorePath,
        storedKeystorePath: profile.keystorePath,
        storedPathWasAbsolute: prepared.storedPathWasAbsolute,
        testedKeystorePaths: prepared.testedPaths,
        signingSessionId: prepared.sessionId,
      },
    };
  },
};
