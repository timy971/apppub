import type { SystemBridge } from "./types";
import type {
  DetectedFiles,
  ExecLineHandler,
  ExecOptions,
  ExecResult,
  ScannedProject,
  SystemInfo,
} from "@/core/types";

/**
 * Adapter Web (preview Lovable et développement).
 * Toutes les opérations système sont simulées de façon déterministe pour
 * offrir une expérience utilisable identique à Phase 1. Aucune opération
 * n'est réellement exécutée.
 */

function inferName(path: string): string {
  const clean = path.replace(/[\\/]+$/, "");
  const last = clean.split(/[\\/]/).pop() ?? "Mon projet";
  return last.charAt(0).toUpperCase() + last.slice(1);
}

const SIMULATED_LINES = [
  "Analyse du projet…",
  "Lecture du fichier de version…",
  "Vérification des dépendances…",
  "Préparation de l'application Android…",
  "Compilation en cours…",
  "Signature et empaquetage…",
  "Écriture du fichier final…",
];

async function fakeExec(_opts: ExecOptions, onLine?: ExecLineHandler): Promise<ExecResult> {
  const start = performance.now();
  let out = "";
  for (const line of SIMULATED_LINES) {
    await new Promise((r) => setTimeout(r, 180));
    out += line + "\n";
    onLine?.({ stream: "stdout", line });
  }
  return {
    exitCode: 0,
    stdout: out,
    stderr: "",
    durationMs: performance.now() - start,
    aborted: false,
  };
}

export const webBridge: SystemBridge = {
  runtime: "web",

  system: {
    async detect(): Promise<SystemInfo> {
      return {
        platform: "web",
        node: "22.0.0 (simulé)",
        npm: "10.0.0 (simulé)",
        git: "2.40.0 (simulé)",
        java: "17 (simulé)",
        androidStudio: undefined,
        androidSdk: "34 (simulé)",
        androidSdkPath: undefined,
        androidHome: undefined,
        javaHome: undefined,
        internet: typeof navigator !== "undefined" ? navigator.onLine : true,
      };
    },
  },

  projects: {
    async detect(path: string): Promise<DetectedFiles> {
      return {
        hasPackageJson: true,
        hasVersionJson: true,
        hasCapacitorConfig: true,
        hasAndroid: true,
        hasIos: false,
        hasVersionScript: true,
        hasGradleWrapper: true,
        hasChangelog: false,
        packageName: inferName(path),
        currentVersion: "1.0.0",
        currentBuild: 1,
        androidReadiness: "ready",
        packageManager: "npm",
        webBuildScript: "vite build",
        webOutputDir: "dist",
        capacitorAppId: "app.exemple.android",
      };
    },

    async scan(rootPath: string): Promise<ScannedProject[]> {
      const base = rootPath.replace(/[\\/]+$/, "");
      const names = ["CranioScan", "Orthopulse", "VictoryTrack"];
      return names.map((n) => ({
        path: `${base}/${n}`,
        name: n,
        detected: {
          hasPackageJson: true,
          hasVersionJson: true,
          hasCapacitorConfig: true,
          hasAndroid: true,
          hasIos: n === "CranioScan",
          hasVersionScript: true,
          hasGradleWrapper: true,
          hasChangelog: n === "CranioScan",
          packageName: n,
          currentVersion: "1.0.0",
          currentBuild: 1,
          androidReadiness: "ready",
          packageManager: "npm",
          webBuildScript: "vite build",
          webOutputDir: "dist",
          capacitorAppId: `app.${n.toLowerCase()}.android`,
        },
      }));
    },

    async chooseFolder(): Promise<string | null> {
      if (typeof window === "undefined") return null;
      const p = window.prompt("Chemin du dossier de vos projets :", "/Users/moi/Projets");
      return p?.trim() || null;
    },

    async reauthorizeFolder(expectedPath): Promise<string | null> {
      return expectedPath;
    },
  },

  git: {
    async inspectRemote(remoteUrl) {
      return { remoteUrl, defaultBranch: "main", branches: ["main", "develop"] };
    },
    async clone({ remoteUrl, branch }) {
      const name =
        remoteUrl
          .split("/")
          .pop()
          ?.replace(/\.git$/, "") || "projet";
      const localPath = `/Users/moi/Projets AppPublisher/${name}`;
      const detected = await webBridge.projects.detect(localPath);
      if (!detected) throw new Error("Projet simulé introuvable.");
      return {
        localPath,
        reused: false,
        status: {
          remoteUrl,
          branch,
          headSha: "0123456789abcdef0123456789abcdef01234567",
          shortSha: "0123456789",
          ahead: 0,
          behind: 0,
          relation: "up-to-date",
          workingTree: "clean",
          changedFiles: [],
          checkedAt: new Date().toISOString(),
        },
        detected,
      };
    },
    async status({ remoteUrl, branch }) {
      return {
        remoteUrl,
        branch,
        headSha: "0123456789abcdef0123456789abcdef01234567",
        shortSha: "0123456789",
        ahead: 0,
        behind: 0,
        relation: "up-to-date",
        workingTree: "clean",
        changedFiles: [],
        checkedAt: new Date().toISOString(),
      };
    },
    async check(args) {
      return webBridge.git.status(args);
    },
    async sync(args) {
      const status = await webBridge.git.status(args);
      const detected = await webBridge.projects.detect(args.projectPath);
      if (!detected) throw new Error("Projet simulé introuvable.");
      return {
        updated: false,
        previousHeadSha: status.headSha,
        status,
        detected,
      };
    },
  },

  androidPreparation: {
    async inspect(projectPath) {
      return {
        status: "preparable",
        blockers: [],
        warnings: [],
        changes: [
          "Installer les dépendances avec npm",
          "Créer capacitor.config.json",
          "Exécuter le build web vers dist/",
          "Créer puis synchroniser le dossier android/",
          "Compiler une version Android de contrôle",
        ],
        packageManager: "npm",
        buildScript: "vite build",
        hasCapacitorConfig: false,
        hasCapacitorCore: false,
        hasCapacitorCli: false,
        hasCapacitorAndroid: false,
        hasAndroid: false,
        hasGradleWrapper: false,
        appName: inferName(projectPath),
        applicationId: "app.exemple.android",
        webDir: "dist",
        webOutputReady: false,
      };
    },
    async createConfig(projectPath) {
      return { created: true, path: `${projectPath}/capacitor.config.json` };
    },
    async beginRollbackGuard() {
      return { token: "web-android-rollback-guard" };
    },
    async rollbackCreatedArtifacts() {
      return { removed: [] };
    },
    async completeRollbackGuard() {
      return { completed: true };
    },
  },

  androidCorrections: {
    async preview(_projectPath, desired) {
      const actions = Object.entries(desired).map(([key, value]) => ({
        id: `preview:${key}`,
        kind:
          key === "packageName"
            ? ("package" as const)
            : key === "targetSdk"
              ? ("sdk" as const)
              : ("version" as const),
        title: `Corriger ${key}`,
        file: key === "packageName" ? "capacitor.config.json" : "android/app/build.gradle",
        before: "valeur actuelle",
        after: String(value),
        sensitive: key === "packageName",
      }));
      return {
        token: "web-preview-token",
        desired,
        actions,
        blocked: [],
        changedFiles: [...new Set(actions.map((action) => action.file))],
        canApply: actions.length > 0,
        sensitive: actions.some((action) => action.sensitive),
      };
    },
    async apply(_projectPath, _desired, _token) {
      return { applied: true, actions: [], changedFiles: [] };
    },
  },

  aab: {
    async inspect(request) {
      const reportPath = request.persistReport
        ? `${request.path}.apppublisher-report.json`
        : undefined;
      return {
        schemaVersion: 1,
        inspectedAt: new Date().toISOString(),
        verdict: "warnings",
        packageName: request.expected.packageName ?? "app.exemple.android",
        versionName: request.expected.versionName ?? "1.0.0",
        versionCode: request.expected.versionCode ?? 1,
        minSdk: 24,
        targetSdk: 35,
        modules: ["base"],
        artifactSha256: "A".repeat(64),
        artifactSizeBytes: 42_000_000,
        signatureValid: true,
        signerSha256: request.expected.signerSha256 ?? "B".repeat(64),
        signerCertificate: "CN=AppPublisher Preview",
        expected: request.expected,
        bundletool: { status: "unavailable" },
        issues: [
          {
            id: "bundletool-unavailable",
            severity: "warning",
            title: "Contrôle bundletool non exécuté",
            detail: "Simulation de l'aperçu Web.",
          },
        ],
        reportPath,
      };
    },
  },

  gradle: {
    async ensureExecutable(projectPath) {
      return { ok: true, path: `${projectPath}/android/gradlew` };
    },
    async ensureSigningPatch() {
      return { ok: true, changed: false };
    },
  },

  backups: {
    async create(projectPath) {
      return { location: `${projectPath}/.apppublisher-backups/simulation`, files: [] };
    },
    async restore(_projectPath, location, files) {
      return { location, files };
    },
  },

  exec: {
    run: fakeExec,
  },

  fs: {
    async exists() {
      return true;
    },
    async readJson() {
      return null;
    },
    async readText() {
      return null;
    },
    async stat() {
      return { size: 0, isFile: false, isDir: true };
    },
    async listDir() {
      return [];
    },
    async findByExtension() {
      return [];
    },
  },

  shell: {
    async openFolder() {
      // no-op en web
    },
    async revealItem() {
      // no-op en web
    },
    async openExternal(url) {
      if (typeof window === "undefined") return false;
      return window.open(url, "_blank", "noopener,noreferrer") != null;
    },
  },

  net: {
    async online() {
      if (typeof navigator === "undefined") return true;
      return navigator.onLine;
    },
  },

  secrets: {
    async supported() {
      return {
        platform: "web",
        available: false,
        reason:
          "Aperçu Lovable : le trousseau système n'est disponible que dans l'application de bureau.",
      };
    },
    async set() {
      return false;
    },
    async remove() {
      return true;
    },
  },

  signing: {
    async chooseKeystore() {
      return null;
    },
    async chooseOutputFolder() {
      return null;
    },
    async keystoreList() {
      return {
        ok: false,
        errorCode: "keytool-missing",
        errorHint: "Aperçu Lovable — keytool n'est disponible que dans l'application de bureau.",
      };
    },
    async keystoreCreate() {
      return {
        ok: false,
        errorCode: "keytool-missing",
        errorHint: "Aperçu Lovable — keytool n'est disponible que dans l'application de bureau.",
      };
    },
    async validateStored() {
      return {
        ok: false,
        errorCode: "keychain-unavailable",
        errorHint: "Le trousseau n'est pas disponible dans l'aperçu Web.",
      };
    },
    async prepareBuild() {
      return {
        ok: false,
        errorCode: "keychain-unavailable",
        errorHint: "Le trousseau n'est pas disponible dans l'aperçu Web.",
      };
    },
    async scan() {
      return [];
    },
    async resolveKeystore({ storedPath }) {
      return {
        ok: false,
        storedPath,
        testedPaths: [storedPath],
        isAbsolute: false,
        readable: false,
        errorCode: "not-found",
      };
    },
    async verifyAab() {
      return { ok: false, errorCode: "file-missing" };
    },
  },
};
