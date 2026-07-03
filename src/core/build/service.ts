import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";

/**
 * BuildService — orchestre la construction Android.
 * L'appelant fournit un `onStep` pour mettre à jour l'UI (WorkflowView).
 * Chaque étape peut échouer : le service renvoie l'erreur brute, et
 * `translateError` s'en occupe côté UI pour produire un message humain.
 */

export interface BuildResult {
  aabPath?: string;
  aabSize?: number;
  durationMs: number;
  succeeded: boolean;
}

export interface StepReport {
  id: string;
  status: "success" | "warning" | "error" | "skipped";
  detail?: string;
}

export interface BuildRunOptions {
  onStep: (id: string, status: StepReport["status"], detail?: string) => void;
  onLine?: (line: string) => void;
}

async function run(
  project: Project,
  cmd: string,
  args: string[],
  cwd: string,
  onLine?: (l: string) => void,
) {
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

    if (b.runtime === "web") {
      // Simulation Phase 1-compatible : produit un nom d'artefact plausible.
      for (const id of ["deps", "web", "sync", "gradle", "artifact"]) {
        opts.onStep(id, "success");
        await new Promise((r) => setTimeout(r, 400));
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
    const hasNodeModules = await b.fs.exists(`${project.localPath}/node_modules`);
    if (!hasNodeModules) {
      opts.onStep("deps", "success", "Installation des dépendances…");
      const r = await run(project, "npm", ["install"], project.localPath, opts.onLine);
      if (r.exitCode !== 0) {
        opts.onStep("deps", "error", "L'installation des dépendances a échoué.");
        throw new Error(r.stderr || r.stdout);
      }
      opts.onStep("deps", "success", "Dépendances installées.");
    } else {
      opts.onStep("deps", "skipped", "Dépendances déjà installées.");
    }

    // 2. Build web
    opts.onStep("web", "success", "Compilation de la partie web…");
    const web = await run(project, "npm", ["run", "build"], project.localPath, opts.onLine);
    if (web.exitCode !== 0) {
      opts.onStep("web", "error", "La compilation web a échoué.");
      throw new Error(web.stderr || web.stdout);
    }
    opts.onStep("web", "success", "Partie web compilée.");

    // 3. Sync Capacitor
    opts.onStep("sync", "success", "Préparation de l'application Android…");
    const sync = await run(project, "npx", ["cap", "sync", "android"], project.localPath, opts.onLine);
    if (sync.exitCode !== 0) {
      opts.onStep("sync", "error", "La préparation Android a échoué.");
      throw new Error(sync.stderr || sync.stdout);
    }
    opts.onStep("sync", "success", "Application Android préparée.");

    // 4. Gradle bundleRelease
    const androidDir = `${project.localPath}/android`;
    const gradleCmd =
      (await b.fs.exists(`${androidDir}/gradlew.bat`))
        ? "gradlew.bat"
        : "./gradlew";
    opts.onStep("gradle", "success", "Fabrication du fichier Android…");
    const gradle = await run(project, gradleCmd, ["bundleRelease"], androidDir, opts.onLine);
    if (gradle.exitCode !== 0) {
      opts.onStep("gradle", "error", "La construction Android a échoué.");
      throw new Error(gradle.stderr || gradle.stdout);
    }
    opts.onStep("gradle", "success", "Fichier Android fabriqué.");

    // 5. Localisation de l'artefact
    opts.onStep("artifact", "success", "Recherche du fichier final…");
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
