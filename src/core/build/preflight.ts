import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { getAndroidConfig } from "@/core/projects/android-config";
import { resolvePublicationApplicationId } from "@/core/publication/intent";
import { ensureGradleExecutable, hasGlobalGradle, resolveGradle } from "./gradle";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";
import { SigningValidator } from "@/features/android-signing/services/signing-validator";

/**
 * Préflight de build Android — vérifie tout ce qui peut être détecté
 * *sans* lancer Gradle. Objectif : découvrir les erreurs bloquantes
 * immédiatement, pas après plusieurs minutes de compilation.
 *
 * Aucune duplication : on s'appuie sur `bridge`, `getAndroidConfig`,
 * `resolveGradle`. Les checks sont indépendants et ordonnés par catégorie.
 */

export type CheckStatus = "success" | "warning" | "error";
export type CheckCategory =
  | "project"
  | "android"
  | "keystore"
  | "environment"
  | "capacitor";

export type BuildFixKind =
  | "chmod-gradlew"
  | "adopt-keystore"
  | "open-cockpit"
  | "open-diagnostic"
  | "create-android";

export interface BuildFix {
  label: string;
  kind: BuildFixKind;
  /** Charge utile spécifique au fix (chemin suggéré, ancre cockpit, …). */
  payload?: Record<string, string | undefined>;
  /** true si la correction requiert une confirmation utilisateur. */
  confirm?: boolean;
}

export interface BuildCheck {
  id: string;
  category: CheckCategory;
  status: CheckStatus;
  title: string;
  message: string;
  /** Explication technique réservée au mode Expert. */
  technical?: string;
  fix?: BuildFix;
}

export interface BuildPreflight {
  /** true si aucun check n'est en `error`. Un `warning` n'est pas bloquant. */
  ok: boolean;
  /** true si au moins un check est en `error`. */
  hasBlockers: boolean;
  checks: BuildCheck[];
  /** Corrections sûres déjà effectuées automatiquement pendant le préflight. */
  autoRepairs: Array<{ id: string; message: string }>;
  /** Suggestion de keystore trouvée dans le projet (pour l'auto-fix sensible). */
  keystoreCandidate?: string;
}

/**
 * Cherche un fichier .keystore ailleurs dans le projet quand la valeur
 * configurée ne pointe sur rien. Limité aux dossiers android/ + racine.
 */
async function searchKeystoreCandidates(projectPath: string): Promise<string[]> {
  const b = bridge();
  const androidDir = `${projectPath}/android`;
  const results = new Set<string>();
  try {
    const inAndroid = await b.fs.findByExtension(androidDir, ".keystore", 4);
    inAndroid.forEach((p) => results.add(p));
  } catch {
    /* ignore */
  }
  try {
    const jks = await b.fs.findByExtension(androidDir, ".jks", 4);
    jks.forEach((p) => results.add(p));
  } catch {
    /* ignore */
  }
  return Array.from(results);
}

function basename(p: string | undefined): string | undefined {
  if (!p) return undefined;
  return p.split(/[\\/]/).pop();
}

export const PreflightService = {
  async run(
    project: Project,
    options: { autoRepair?: boolean } = {},
  ): Promise<BuildPreflight> {
    const b = bridge();
    const checks: BuildCheck[] = [];
    const autoRepairs: BuildPreflight["autoRepairs"] = [];
    const projectPath = project.localPath;
    const androidDir = `${projectPath}/android`;

    // Web (preview Lovable) — préflight simulé, jamais bloquant.
    if (b.runtime === "web") {
      return {
        ok: true,
        hasBlockers: false,
        checks: [
          {
            id: "web-preview",
            category: "project",
            status: "success",
            title: "Aperçu Lovable",
            message: "Préflight simulé : la construction réelle n'est disponible que dans l'application.",
          },
        ],
        autoRepairs: [],
      };
    }

    // ---------- Projet ----------
    const [hasProjectDir, hasAndroidDir, hasPackage] = await Promise.all([
      b.fs.exists(projectPath),
      b.fs.exists(androidDir),
      b.fs.exists(`${projectPath}/package.json`),
    ]);

    const managedGit =
      project.source?.type === "git" && project.source.managed === true;
    const disposableAndroid =
      !hasAndroidDir &&
      managedGit &&
      project.detected.androidReadiness !== "blocked";

    checks.push({
      id: "project-dir",
      category: "project",
      status: hasProjectDir ? "success" : "error",
      title: "Dossier du projet",
      message: hasProjectDir
        ? "Dossier du projet accessible."
        : "Le dossier du projet est introuvable.",
      technical: projectPath,
      fix: hasProjectDir
        ? undefined
        : { label: "Ouvrir la fiche du projet", kind: "open-cockpit", payload: { tab: "identity" } },
    });

    checks.push({
      id: "package-json",
      category: "project",
      status: hasPackage ? "success" : "error",
      title: "package.json",
      message: hasPackage
        ? "package.json détecté."
        : "package.json manquant à la racine.",
      technical: `${projectPath}/package.json`,
    });

    checks.push({
      id: "android-dir",
      category: "project",
      status: hasAndroidDir || disposableAndroid ? "success" : "error",
      title: "Dossier Android",
      message: hasAndroidDir
        ? "Dossier android/ détecté."
        : disposableAndroid
          ? "Android sera créé automatiquement dans une source de publication propre."
          : project.detected.androidReadiness === "blocked"
            ? project.detected.androidReadinessReason ||
              "Ce projet web doit être corrigé avant la préparation Android."
            : "Ce projet web peut être configuré, compilé et préparé pour Android par AppPublisher.",
      technical: disposableAndroid
        ? "Aucune modification Android n'est requise dans le clone source."
        : androidDir,
      fix:
        hasAndroidDir || disposableAndroid || project.detected.androidReadiness === "blocked"
          ? undefined
          : { label: "Préparer Android", kind: "create-android", confirm: false },
    });

    // ---------- Gradle wrapper ----------
    const gradle = await resolveGradle(projectPath);
    const globalGradleAvailable =
      disposableAndroid || gradle.wrapperExists ? false : await hasGlobalGradle(androidDir);
    checks.push({
      id: "gradle-wrapper",
      category: "android",
      status: disposableAndroid
        ? "success"
        : gradle.wrapperExists
          ? "success"
          : globalGradleAvailable
            ? "warning"
            : "error",
      title:
        gradle.platform === "win32" ? "Wrapper Gradle (gradlew.bat)" : "Wrapper Gradle (gradlew)",
      message: disposableAndroid
        ? "Le wrapper Gradle sera généré automatiquement avec Android."
        : gradle.wrapperExists
          ? "Wrapper Gradle trouvé."
          : globalGradleAvailable
            ? "Wrapper absent : AppPublisher utilisera l'installation globale de Gradle."
            : "Le wrapper Gradle attendu est introuvable et aucune installation globale n'est disponible.",
      technical: disposableAndroid
        ? "Généré dans le workspace jetable."
        : globalGradleAvailable
          ? `Repli : gradle bundleRelease depuis ${androidDir}`
          : gradle.expectedWrapperPath,
    });

    // Exécutable sous Unix
    if (gradle.platform !== "win32" && gradle.hasWrapperUnix) {
      let executableReady = true;
      if (options.autoRepair && !managedGit) {
        executableReady = await ensureGradleExecutable(projectPath);
        if (executableReady) {
          autoRepairs.push({
            id: "gradle-executable",
            message: "Le wrapper Gradle a été rendu exécutable automatiquement.",
          });
        }
      }
      checks.push({
        id: "gradle-executable",
        category: "android",
        status: executableReady ? "success" : "error",
        title: "Wrapper Gradle exécutable",
        message: managedGit
          ? "AppPublisher vérifiera les droits de gradlew dans le workspace jetable, sans modifier la source."
          : executableReady
            ? options.autoRepair
              ? "AppPublisher a vérifié et corrigé automatiquement les droits de gradlew."
              : "AppPublisher s'assurera que gradlew est exécutable avant de lancer le build."
            : "AppPublisher n'a pas pu rendre gradlew exécutable automatiquement.",
        technical: `chmod +x ${gradle.expectedWrapperPath}`,
        fix:
          managedGit || executableReady
            ? undefined
            : {
                label: "Réessayer automatiquement",
                kind: "chmod-gradlew",
                confirm: false,
              },
      });
    }

    // build.gradle
    const hasAppGradle = hasAndroidDir
      ? await b.fs.exists(`${androidDir}/app/build.gradle`)
      : false;
    checks.push({
      id: "build-gradle",
      category: "android",
      status: hasAppGradle || disposableAndroid ? "success" : "error",
      title: "Configuration Android",
      message: hasAppGradle
        ? "Fichier de configuration Gradle trouvé."
        : disposableAndroid
          ? "La configuration Gradle sera créée automatiquement dans le workspace."
          : "android/app/build.gradle est introuvable.",
      technical: disposableAndroid
        ? "Configuration générée dans le workspace jetable."
        : `${androidDir}/app/build.gradle`,
    });

    // applicationId / versions
    const android = getAndroidConfig(project);
    const publicationApplicationId = resolvePublicationApplicationId(project);
    checks.push({
      id: "application-id",
      category: "android",
      status: publicationApplicationId ? "success" : "error",
      title: "Identifiant d'application",
      message: publicationApplicationId
        ? `Identifiant Android fiable : ${publicationApplicationId}`
        : "AppPublisher n'a pas encore identifié l'application Android à publier.",
      fix: publicationApplicationId
        ? undefined
        : {
            label: "Configurer l'identifiant",
            kind: "open-cockpit",
            payload: { tab: "publishing", field: "android.applicationId" },
          },
    });

    checks.push({
      id: "version",
      category: "android",
      status: project.currentVersion ? "success" : "warning",
      title: "Version",
      message: project.currentVersion
        ? `Version ${project.currentVersion} · build ${project.currentBuild}`
        : "Aucune version détectée pour ce projet.",
      fix: project.currentVersion
        ? undefined
        : { label: "Définir une version", kind: "open-cockpit", payload: { tab: "configuration", field: "currentVersion" } },
    });

    // ---------- Keystore / Signature ----------
    const profileId = android.signingProfileId;
    const linkedProfile = profileId ? ProfilesStore.get(profileId) : undefined;

    if (profileId && !linkedProfile) {
      checks.push({
        id: "signing-profile-missing",
        category: "keystore",
        status: "error",
        title: "Association de signature obsolète",
        message:
          "Le profil précédemment associé à ce projet n'existe plus dans AppPublisher. Choisissez à nouveau le profil de signature ; votre fichier keystore n'a pas été supprimé.",
        technical: `Identifiant du profil introuvable : ${profileId}`,
        fix: {
          label: "Réassocier la signature",
          kind: "open-cockpit",
          payload: { tab: "publishing", field: "android.signingProfileId" },
        },
      });
    } else if (linkedProfile) {
      // Nouveau chemin : profil de signature lié → validation complète
      // (fichier + mot de passe trousseau + alias + certificat).
      const val = await SigningValidator.validate(linkedProfile.id, project.localPath);
      checks.push({
        id: "signing-profile",
        category: "keystore",
        status: val.ok ? "success" : "error",
        title: `Signature : ${linkedProfile.name}`,
        message: val.ok
          ? `Signature validée (alias « ${linkedProfile.alias} »).`
          : val.message,
        technical: [
          linkedProfile.keystorePath,
          val.certificate?.sha256 ? `SHA-256 : ${val.certificate.sha256}` : undefined,
          val.certificate?.validUntil ? `Expire le ${val.certificate.validUntil.slice(0, 10)}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
        fix: val.ok
          ? undefined
          : { label: "Ouvrir les signatures", kind: "open-cockpit", payload: { tab: "publishing", field: "android.signingProfileId" } },
      });
    } else {
      const keystorePath = android.keystorePath;
      if (!keystorePath) {
        checks.push({
          id: "keystore-configured",
          category: "keystore",
          status: "error",
          title: "Clé de signature",
          message: "Aucune clé de signature n'est associée à ce projet.",
          fix: { label: "Configurer la signature", kind: "open-cockpit", payload: { tab: "publishing", field: "android.signingProfileId" } },
        });
      } else {
        const keystoreExists = await b.fs.exists(keystorePath);
        let candidate: string | undefined;
        if (!keystoreExists) {
          const wanted = basename(keystorePath);
          const candidates = await searchKeystoreCandidates(projectPath);
          candidate =
            candidates.find((p) => basename(p) === wanted) ??
            candidates[0];
        }
        checks.push({
          id: "keystore-exists",
          category: "keystore",
          status: keystoreExists ? "success" : "error",
          title: "Fichier de la clé de signature",
          message: keystoreExists
            ? "La clé de signature est présente à l'emplacement configuré."
            : candidate
              ? `La clé configurée est introuvable, mais un fichier similaire a été trouvé dans le projet.`
              : "La clé configurée est introuvable dans le projet.",
          technical: keystoreExists
            ? keystorePath
            : `Configuré : ${keystorePath}${candidate ? `\nCandidat : ${candidate}` : ""}`,
          fix: keystoreExists
            ? undefined
            : candidate
              ? {
                  label: "Utiliser le fichier trouvé",
                  kind: "adopt-keystore",
                  confirm: true,
                  payload: { path: candidate },
                }
              : { label: "Choisir un autre fichier", kind: "open-cockpit", payload: { tab: "publishing", field: "android.keystorePath" } },
        });

        checks.push({
          id: "keystore-alias",
          category: "keystore",
          status: android.keystoreAlias ? "success" : "warning",
          title: "Alias de signature",
          message: android.keystoreAlias
            ? `Alias : ${android.keystoreAlias}`
            : "Aucun alias renseigné. Gradle demandera l'alias au moment de signer.",
          fix: android.keystoreAlias
            ? undefined
            : { label: "Renseigner l'alias", kind: "open-cockpit", payload: { tab: "publishing", field: "android.keystoreAlias" } },
        });
      }
    }

    // ---------- Environnement ----------
    const info = await b.system.detect().catch(() => null);
    checks.push({
      id: "java",
      category: "environment",
      status: info?.java ? "success" : "error",
      title: "Java (JDK)",
      message: info?.java
        ? `Java détecté (${info.java}).`
        : "Java n'a pas été détecté. Gradle ne peut pas compiler sans JDK.",
      technical: info?.javaHome ? `JAVA_HOME=${info.javaHome}` : "JAVA_HOME n'est pas défini",
      fix: info?.java
        ? undefined
        : { label: "Ouvrir le diagnostic", kind: "open-diagnostic" },
    });

    checks.push({
      id: "java-home",
      category: "environment",
      status: info?.javaHome ? "success" : info?.java ? "warning" : "error",
      title: "JAVA_HOME",
      message: info?.javaHome
        ? "Variable JAVA_HOME définie."
        : "Variable JAVA_HOME absente — Gradle peut échouer selon la version de Java.",
      technical: info?.javaHome,
    });

    checks.push({
      id: "android-sdk",
      category: "environment",
      status: info?.androidSdk || info?.androidHome ? "success" : "error",
      title: "SDK Android",
      message:
        info?.androidSdk || info?.androidHome
          ? "SDK Android détecté."
          : "Le SDK Android est introuvable. Installez Android Studio ou définissez ANDROID_HOME.",
      technical: info?.androidHome
        ? `ANDROID_HOME=${info.androidHome}`
        : info?.androidSdkPath,
      fix:
        info?.androidSdk || info?.androidHome
          ? undefined
          : { label: "Ouvrir le diagnostic", kind: "open-diagnostic" },
    });

    // adb
    const adb = await b.exec
      .run({ cmd: "adb", args: ["--version"], timeoutMs: 5000 })
      .then((r) => r.exitCode === 0)
      .catch(() => false);
    checks.push({
      id: "adb",
      category: "environment",
      status: adb ? "success" : "warning",
      title: "adb (Android Debug Bridge)",
      message: adb
        ? "adb est accessible."
        : "adb n'est pas dans le PATH. Non requis pour un .aab, utile pour tester sur téléphone.",
    });

    // ---------- Capacitor ----------
    const [hasCapConfig, hasSyncedAssets] = await Promise.all([
      b.fs.exists(`${projectPath}/capacitor.config.json`).then((x) =>
        x ? true : b.fs.exists(`${projectPath}/capacitor.config.ts`),
      ),
      b.fs.exists(`${androidDir}/app/src/main/assets/public/index.html`),
    ]);

    checks.push({
      id: "capacitor-config",
      category: "capacitor",
      status: hasCapConfig || disposableAndroid ? "success" : "warning",
      title: "Configuration Capacitor",
      message: hasCapConfig
        ? "capacitor.config détecté."
        : disposableAndroid
          ? "La configuration Capacitor sera créée automatiquement dans le workspace."
          : "Aucun capacitor.config détecté à la racine du projet.",
    });

    checks.push({
      id: "capacitor-sync",
      category: "capacitor",
      status: hasSyncedAssets || hasAndroidDir || disposableAndroid ? "success" : "warning",
      title: "Synchronisation Android",
      message: hasSyncedAssets
        ? "Les fichiers web sont déjà présents côté Android."
        : hasAndroidDir
          ? "AppPublisher synchronisera automatiquement les fichiers web pendant le build."
          : disposableAndroid
            ? "Android et les fichiers web seront créés et synchronisés automatiquement."
            : "La synchronisation Android sera effectuée pendant la préparation.",
    });

    const hasBlockers = checks.some((c) => c.status === "error");
    const keystoreCandidate = checks
      .find((c) => c.id === "keystore-exists" && c.fix?.kind === "adopt-keystore")?.fix
      ?.payload?.path;

    return {
      ok: !hasBlockers,
      hasBlockers,
      checks,
      autoRepairs,
      keystoreCandidate,
    };
  },
};
