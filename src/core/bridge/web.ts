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
        },
      }));
    },

    async chooseFolder(): Promise<string | null> {
      if (typeof window === "undefined") return null;
      const p = window.prompt("Chemin du dossier de vos projets :", "/Users/moi/Projets");
      return p?.trim() || null;
    },

    async registerRoots(): Promise<string[]> {
      // No-op en Web : pas de confinement fs à alimenter.
      return [];
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
    async mkdir() {
      return true;
    },
    async writeText() {
      return true;
    },
    async writeJson() {
      return true;
    },
    async copyFile() {
      return true;
    },
  },

  shell: {
    async openFolder() {
      // no-op en web
    },
    async revealItem() {
      // no-op en web
    },
  },

  net: {
    async online() {
      if (typeof navigator === "undefined") return true;
      return navigator.onLine;
    },
  },
};
