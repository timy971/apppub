import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { getAndroidConfig } from "@/core/projects/android-config";
import { resolveGradle } from "./gradle";

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
  | "open-android-folder";

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
  /** Suggestion de keystore trouvée dans le projet (pour l'auto-fix). */
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
  async run(project: Project): Promise<BuildPreflight> {
    const b = bridge();
    const checks: BuildCheck[] = [];
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
      };
    }

    // ---------- Projet ----------
    const [hasProjectDir, hasAndroidDir, hasPackage] = await Promise.all([
      b.fs.exists(projectPath),
      b.fs.exists(androidDir),
      b.fs.exists(`${projectPath}/package.json`),
    ]);

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
      status: hasAndroidDir ? "success" : "error",
      title: "Dossier Android",
      message: hasAndroidDir
        ? "Dossier android/ détecté."
        : "Ce projet ne contient pas de dossier android/. Lancez `npx cap add android`.",
      technical: androidDir,
    });

    // ---------- Gradle wrapper ----------
    const gradle = await resolveGradle(projectPath);
    checks.push({
      id: "gradle-wrapper",
      category: "android",
      status: gradle.wrapperExists ? "success" : "error",
      title: gradle.platform === "win32" ? "Wrapper Gradle (gradlew.bat)" : "Wrapper Gradle (gradlew)",
      message: gradle.wrapperExists
        ? "Wrapper Gradle trouvé."
        : "Le wrapper Gradle attendu est introuvable dans le projet Android.",
      technical: gradle.expectedWrapperPath,
    });

    // Exécutable sous Unix
    if (gradle.platform !== "win32" && gradle.hasWrapperUnix) {
      // On ne peut pas lire le bit exécutable via le bridge — on propose
      // toujours la correction en warning (idempotente, sans risque).
      checks.push({
        id: "gradle-executable",
        category: "android",
        status: "success",
        title: "Wrapper Gradle exécutable",
        message: "AppPublisher s'assurera que gradlew est exécutable avant de lancer le build.",
        technical: `chmod +x ${gradle.expectedWrapperPath}`,
        fix: {
          label: "Rendre gradlew exécutable maintenant",
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
      status: hasAppGradle ? "success" : "error",
      title: "android/app/build.gradle",
      message: hasAppGradle
        ? "Fichier de configuration Gradle trouvé."
        : "android/app/build.gradle est introuvable.",
      technical: `${androidDir}/app/build.gradle`,
    });

    // applicationId / versions
    const android = getAndroidConfig(project);
    checks.push({
      id: "application-id",
      category: "android",
      status: android.applicationId ? "success" : "warning",
      title: "Identifiant d'application",
      message: android.applicationId
        ? `Identifiant détecté : ${android.applicationId}`
        : "Aucun identifiant d'application configuré (applicationId).",
      fix: android.applicationId
        ? undefined
        : { label: "Configurer l'identifiant", kind: "open-cockpit", payload: { tab: "android", field: "applicationId" } },
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
        : { label: "Définir une version", kind: "open-cockpit", payload: { tab: "version" } },
    });

    // ---------- Keystore ----------
    const keystorePath = android.keystorePath;
    if (!keystorePath) {
      checks.push({
        id: "keystore-configured",
        category: "keystore",
        status: "error",
        title: "Clé de signature",
        message: "Aucune clé de signature n'est configurée pour ce projet.",
        fix: { label: "Configurer la clé", kind: "open-cockpit", payload: { tab: "android", field: "keystorePath" } },
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
            : { label: "Choisir un autre fichier", kind: "open-cockpit", payload: { tab: "android", field: "keystorePath" } },
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
          : { label: "Renseigner l'alias", kind: "open-cockpit", payload: { tab: "android", field: "keystoreAlias" } },
      });
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
      status: hasCapConfig ? "success" : "warning",
      title: "Configuration Capacitor",
      message: hasCapConfig
        ? "capacitor.config détecté."
        : "Aucun capacitor.config détecté à la racine du projet.",
    });

    checks.push({
      id: "capacitor-sync",
      category: "capacitor",
      status: hasSyncedAssets ? "success" : "warning",
      title: "Synchronisation Android",
      message: hasSyncedAssets
        ? "Le projet Android contient déjà les fichiers web synchronisés."
        : "Le projet Android n'a pas encore reçu la synchronisation. AppPublisher lancera `cap sync` pendant le build.",
    });

    const hasBlockers = checks.some((c) => c.status === "error");
    const keystoreCandidate = checks
      .find((c) => c.id === "keystore-exists" && c.fix?.kind === "adopt-keystore")?.fix
      ?.payload?.path;

    return {
      ok: !hasBlockers,
      hasBlockers,
      checks,
      keystoreCandidate,
    };
  },
};
