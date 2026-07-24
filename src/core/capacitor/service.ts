import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";

/**
 * CapacitorService — point d'entrée unique pour toutes les opérations
 * Capacitor invoquées depuis AppPublisher (add android, sync, update…).
 *
 * Rôle équivalent à BuildService : ne duplique aucune logique d'exécution,
 * il s'appuie sur `bridge().exec.run` et sur `JournalService` pour la
 * traçabilité. Toute nouvelle commande Capacitor doit atterrir ici afin
 * que le renderer n'exécute jamais lui-même une ligne de commande.
 *
 * Alias historique : `bridge().capacitor.addAndroid(projectPath)` est
 * exposé par ce module — il n'y a qu'une seule implémentation.
 */

export type CapacitorStepStatus =
  | "running"
  | "success"
  | "warning"
  | "error"
  | "skipped";

export interface AddAndroidOptions {
  onStep: (id: string, status: CapacitorStepStatus, detail?: string) => void;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

export type AddAndroidOutcome =
  | { kind: "created" }
  | { kind: "already-exists" }
  | { kind: "capacitor-missing" }
  | { kind: "failed"; message: string };

export interface AddAndroidResult {
  outcome: AddAndroidOutcome;
  durationMs: number;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function exec(
  project: Project,
  cmd: string,
  args: string[],
  cwd: string,
  onLine: ((l: string) => void) | undefined,
  signal: AbortSignal | undefined,
) {
  abortIfNeeded(signal);
  const b = bridge();
  const result = await b.exec.run({ cmd, args, cwd, timeoutMs: 10 * 60_000 }, (l) =>
    onLine?.(l.line),
  );
  JournalService.logCommand({
    command: [cmd, ...args].join(" "),
    cwd,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    message: `[${project.name}] ${cmd} ${args.join(" ")}`,
  });
  return result;
}

function detectAlreadyExists(output: string): boolean {
  return /android platform already exists|already added|platform android exists/i.test(
    output,
  );
}

function detectCapacitorMissing(output: string): boolean {
  return (
    /cannot find module .?@capacitor\//i.test(output) ||
    /command "cap" not found/i.test(output) ||
    /could not determine executable to run/i.test(output) ||
    /npm ERR! 404 .*@capacitor/i.test(output)
  );
}

export const CapacitorService = {
  /**
   * Crée le dossier android/ d'un projet Capacitor.
   *
   * Séquence :
   *  1. Vérifie que le projet est un projet Node (`package.json`).
   *  2. Si `android/` existe déjà, retourne `already-exists` (idempotent).
   *  3. Installe `@capacitor/android` si nécessaire.
   *  4. Exécute `npx cap add android`.
   *  5. Exécute `npx cap sync android` pour peupler l'assets initial.
   */
  async addAndroid(project: Project, opts: AddAndroidOptions): Promise<AddAndroidResult> {
    const start = performance.now();
    const b = bridge();
    const { signal } = opts;
    const cwd = project.localPath;

    // Web preview : simulation instantanée, jamais bloquante.
    if (b.runtime === "web") {
      for (const id of ["prepare", "capacitor", "add", "sync"]) {
        abortIfNeeded(signal);
        opts.onStep(id, "running", "Simulation…");
        opts.onLine?.(`▶ ${id}`);
        await new Promise((r) => setTimeout(r, 300));
        opts.onStep(id, "success", "OK");
      }
      return { outcome: { kind: "created" }, durationMs: performance.now() - start };
    }

    // 1. Préparation
    abortIfNeeded(signal);
    opts.onStep("prepare", "running", "Vérification du projet…");
    const [hasPkg, hasAndroid] = await Promise.all([
      b.fs.exists(`${cwd}/package.json`),
      b.fs.exists(`${cwd}/android`),
    ]);
    if (!hasPkg) {
      opts.onStep("prepare", "error", "package.json manquant.");
      return {
        outcome: { kind: "failed", message: "Aucun package.json à la racine du projet." },
        durationMs: performance.now() - start,
      };
    }
    if (hasAndroid) {
      opts.onStep("prepare", "success", "Dossier android/ déjà présent.");
      opts.onStep("capacitor", "skipped", "");
      opts.onStep("add", "skipped", "");
      opts.onStep("sync", "skipped", "");
      return {
        outcome: { kind: "already-exists" },
        durationMs: performance.now() - start,
      };
    }
    opts.onStep("prepare", "success", "Projet prêt.");

    // 2. Vérifie / installe @capacitor/android
    abortIfNeeded(signal);
    opts.onStep("capacitor", "running", "Vérification de Capacitor…");
    const hasCapAndroid = await b.fs.exists(`${cwd}/node_modules/@capacitor/android`);
    const hasCapCli = await b.fs.exists(`${cwd}/node_modules/@capacitor/cli`);
    if (!hasCapAndroid || !hasCapCli) {
      opts.onLine?.("Installation de @capacitor/cli et @capacitor/android…");
      const install = await exec(
        project,
        "npm",
        ["install", "@capacitor/cli", "@capacitor/android", "@capacitor/core"],
        cwd,
        opts.onLine,
        signal,
      );
      if (install.exitCode !== 0) {
        const combined = `${install.stderr}\n${install.stdout}`;
        if (detectCapacitorMissing(combined)) {
          opts.onStep("capacitor", "error", "Capacitor est introuvable.");
          return {
            outcome: { kind: "capacitor-missing" },
            durationMs: performance.now() - start,
          };
        }
        opts.onStep("capacitor", "error", "L'installation de Capacitor a échoué.");
        return {
          outcome: { kind: "failed", message: install.stderr || install.stdout },
          durationMs: performance.now() - start,
        };
      }
      opts.onStep("capacitor", "success", "Capacitor installé.");
    } else {
      opts.onStep("capacitor", "success", "Capacitor déjà installé.");
    }

    // 3. cap add android
    abortIfNeeded(signal);
    opts.onStep("add", "running", "Création du projet Android…");
    const add = await exec(project, "npx", ["cap", "add", "android"], cwd, opts.onLine, signal);
    const addOutput = `${add.stderr}\n${add.stdout}`;
    if (add.exitCode !== 0) {
      if (detectAlreadyExists(addOutput)) {
        opts.onStep("add", "skipped", "Le projet Android existait déjà.");
        return {
          outcome: { kind: "already-exists" },
          durationMs: performance.now() - start,
        };
      }
      if (detectCapacitorMissing(addOutput)) {
        opts.onStep("add", "error", "Capacitor est introuvable.");
        return {
          outcome: { kind: "capacitor-missing" },
          durationMs: performance.now() - start,
        };
      }
      opts.onStep("add", "error", "La création du projet Android a échoué.");
      return {
        outcome: { kind: "failed", message: add.stderr || add.stdout },
        durationMs: performance.now() - start,
      };
    }
    opts.onStep("add", "success", "Projet Android créé.");

    // 4. cap sync android — peuple les assets initiaux.
    abortIfNeeded(signal);
    opts.onStep("sync", "running", "Synchronisation initiale…");
    const sync = await exec(
      project,
      "npx",
      ["cap", "sync", "android"],
      cwd,
      opts.onLine,
      signal,
    );
    if (sync.exitCode !== 0) {
      // Non bloquant : le dossier Android existe désormais, la sync
      // pourra être relancée par un futur build.
      opts.onStep("sync", "warning", "Synchronisation à relancer plus tard.");
    } else {
      opts.onStep("sync", "success", "Synchronisation initiale terminée.");
    }

    return { outcome: { kind: "created" }, durationMs: performance.now() - start };
  },
};
