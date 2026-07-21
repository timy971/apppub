import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";

/**
 * BuildService — orchestre la construction Android.
 *
 * L'appelant fournit :
 *  - `onStep`  : met à jour l'UI étape par étape.
 *  - `onLine`  : streaming des lignes de sortie vers la console.
 *  - `signal`  : AbortSignal facultatif pour interrompre proprement.
 *
 * Toutes les erreurs remontent brutes ; `translateError` les convertit
 * côté UI. Aucune règle métier n'est dupliquée ailleurs.
 */

export interface BuildResult {
  aabPath?: string;
  aabSize?: number;
  durationMs: number;
  succeeded: boolean;
}

export interface StepReport {
  id: string;
  status: "running" | "success" | "warning" | "error" | "skipped";
  detail?: string;
}

export interface BuildRunOptions {
  onStep: (id: string, status: StepReport["status"], detail?: string) => void;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function run(
  project: Project,
  cmd: string,
  args: string[],
  cwd: string,
  onLine: ((l: string) => void) | undefined,
  signal: AbortSignal | undefined,
) {
  abortIfNeeded(signal);
  const b = bridge();
  const result = await b.exec.run({ cmd, args, cwd, timeoutMs: 30 * 60_000 }, (l) =>
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

export const BuildService = {
  async build(project: Project, opts: BuildRunOptions): Promise<BuildResult> {
    const start = performance.now();
    const b = bridge();
    const { signal } = opts;

    if (b.runtime === "web") {
      // Simulation Phase 1-compatible pour la preview Lovable.
      for (const id of ["deps", "web", "sync", "gradle", "artifact"]) {
        abortIfNeeded(signal);
        opts.onStep(id, "running", "En cours…");
        opts.onLine?.(`▶ ${id}`);
        await new Promise((r) => setTimeout(r, 500));
        opts.onLine?.(`  ok`);
        opts.onStep(id, "success", "Terminé.");
      }
      const name = `${project.name.toLowerCase().replace(/\s+/g, "-")}-v${project.currentVersion}.aab`;
      return {
        aabPath: name,
        aabSize: 42_000_000,
        durationMs: performance.now() - start,
        succeeded: true,
      };
    }

    // 1. Dépendances
    abortIfNeeded(signal);
    const hasNodeModules = await b.fs.exists(`${project.localPath}/node_modules`);
    if (!hasNodeModules) {
      opts.onStep("deps", "running", "Installation des dépendances…");
      const r = await run(project, "npm", ["install"], project.localPath, opts.onLine, signal);
      if (r.exitCode !== 0) {
        opts.onStep("deps", "error", "L'installation des dépendances a échoué.");
        throw new Error(r.stderr || r.stdout);
      }
      opts.onStep("deps", "success", "Dépendances installées.");
    } else {
      opts.onStep("deps", "skipped", "Dépendances déjà installées.");
    }

    // 2. Build web
    abortIfNeeded(signal);
    opts.onStep("web", "running", "Compilation de la partie web…");
    const web = await run(project, "npm", ["run", "build"], project.localPath, opts.onLine, signal);
    if (web.exitCode !== 0) {
      opts.onStep("web", "error", "La compilation web a échoué.");
      throw new Error(web.stderr || web.stdout);
    }
    opts.onStep("web", "success", "Partie web compilée.");

    // 3. Sync Capacitor
    abortIfNeeded(signal);
    opts.onStep("sync", "running", "Préparation de l'application Android…");
    const sync = await run(
      project,
      "npx",
      ["cap", "sync", "android"],
      project.localPath,
      opts.onLine,
      signal,
    );
    if (sync.exitCode !== 0) {
      opts.onStep("sync", "error", "La préparation Android a échoué.");
      throw new Error(sync.stderr || sync.stdout);
    }
    opts.onStep("sync", "success", "Application Android préparée.");

    // 4. Gradle bundleRelease — sélection multi-plateforme centralisée.
    abortIfNeeded(signal);
    const { resolveGradle, ensureGradleExecutable, hasGlobalGradle } = await import("./gradle");
    const gradleRes = await resolveGradle(project.localPath);
    const androidDir = gradleRes.androidDir;

    let invocation = gradleRes.invocation;
    if (!invocation) {
      // Repli : gradle installé globalement (dev averti).
      if (await hasGlobalGradle(androidDir)) {
        opts.onLine?.("gradlew absent — utilisation de Gradle installé globalement.");
        invocation = { cmd: "gradle", args: ["bundleRelease"], cwd: androidDir, wrapper: "global" };
      } else {
        opts.onStep("gradle", "error", "Le wrapper Gradle est introuvable dans le projet Android.");
        throw new Error("Le wrapper Gradle est introuvable dans le projet Android.");
      }
    } else if (invocation.wrapper === "unix") {
      // Idempotent : garantit gradlew exécutable sous Unix.
      await ensureGradleExecutable(project.localPath);
    }

    opts.onStep("gradle", "running", "Fabrication du fichier Android…");
    const gradle = await run(
      project,
      invocation.cmd,
      invocation.args,
      invocation.cwd,
      opts.onLine,
      signal,
    );
    if (gradle.exitCode !== 0) {
      opts.onStep("gradle", "error", "La construction Android a échoué.");
      throw new Error(gradle.stderr || gradle.stdout);
    }
    opts.onStep("gradle", "success", "Fichier Android fabriqué.");


    // 5. Localisation de l'artefact
    abortIfNeeded(signal);
    opts.onStep("artifact", "running", "Recherche du fichier final…");
    const aabs = await b.fs.findByExtension(
      `${androidDir}/app/build/outputs/bundle/release`,
      ".aab",
      3,
    );
    if (!aabs.length) {
      opts.onStep("artifact", "warning", "Fichier .aab introuvable après la construction.");
      return { durationMs: performance.now() - start, succeeded: true };
    }
    const aab = aabs[0];
    const stat = await b.fs.stat(aab);
    opts.onStep("artifact", "success", "Fichier trouvé.");

    return {
      aabPath: aab,
      aabSize: stat?.size,
      durationMs: performance.now() - start,
      succeeded: true,
    };
  },
};
