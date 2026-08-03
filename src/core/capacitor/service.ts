import type { Project } from "@/core/types";
import type {
  AndroidPreparationAnalysis,
  AndroidPreparationRequest,
  SupportedPackageManager,
} from "@/core/bridge/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";

/**
 * Préparation Android guidée. Le renderer ne reçoit aucune primitive
 * générique d'écriture : la configuration Capacitor est créée par une
 * opération Electron dédiée et les commandes restent dans l'allowlist.
 */

export type CapacitorStepStatus = "running" | "success" | "warning" | "error" | "skipped";

export interface PrepareAndroidOptions {
  onStep: (id: string, status: CapacitorStepStatus, detail?: string) => void;
  onLine?: (line: string) => void;
  signal?: AbortSignal;
}

export type PrepareAndroidOutcome =
  | { kind: "created"; debugArtifact?: string }
  | { kind: "already-ready" }
  | { kind: "failed"; message: string };

export interface PrepareAndroidResult {
  outcome: PrepareAndroidOutcome;
  durationMs: number;
  applicationId: string;
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

async function exec(
  project: Project,
  cmd: string,
  args: string[],
  cwd: string,
  onLine: ((line: string) => void) | undefined,
  signal: AbortSignal | undefined,
  timeoutMs = 10 * 60_000,
) {
  abortIfNeeded(signal);
  const result = await bridge().exec.run(
    { cmd, args, cwd, timeoutMs },
    (line) => onLine?.(line.line),
    signal,
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
  if (result.aborted || signal?.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}

export function dependencyInstall(manager: SupportedPackageManager): {
  cmd: string;
  args: string[];
} {
  return { cmd: manager, args: ["install"] };
}

function capacitorInstall(manager: SupportedPackageManager): { cmd: string; args: string[] } {
  const packages = ["@capacitor/cli", "@capacitor/android", "@capacitor/core"];
  return manager === "npm"
    ? { cmd: "npm", args: ["install", ...packages] }
    : { cmd: manager, args: ["add", ...packages] };
}

export function webBuild(manager: SupportedPackageManager): { cmd: string; args: string[] } {
  return manager === "yarn"
    ? { cmd: "yarn", args: ["build"] }
    : { cmd: manager, args: ["run", "build"] };
}

function failedMessage(label: string, stdout: string, stderr: string): string {
  const detail = (stderr || stdout).trim();
  return detail ? `${label}\n${detail}` : label;
}

async function failStep(
  opts: PrepareAndroidOptions,
  id: string,
  label: string,
  result: { stdout: string; stderr: string },
  start: number,
  applicationId: string,
): Promise<PrepareAndroidResult> {
  opts.onStep(id, "error", label);
  return {
    outcome: { kind: "failed", message: failedMessage(label, result.stdout, result.stderr) },
    durationMs: performance.now() - start,
    applicationId,
  };
}

export const CapacitorService = {
  inspect(projectPath: string): Promise<AndroidPreparationAnalysis> {
    return bridge().androidPreparation.inspect(projectPath);
  },

  async prepareAndroid(
    project: Project,
    request: AndroidPreparationRequest,
    opts: PrepareAndroidOptions,
  ): Promise<PrepareAndroidResult> {
    const start = performance.now();
    const b = bridge();
    const cwd = project.localPath;
    const { signal } = opts;

    if (b.runtime === "web") {
      for (const id of ["analyze", "dependencies", "configure", "web", "add", "sync", "verify"]) {
        abortIfNeeded(signal);
        opts.onStep(id, "running", "Simulation…");
        opts.onLine?.(`▶ ${id}`);
        await new Promise((resolve) => setTimeout(resolve, 220));
        opts.onStep(id, "success", "OK");
      }
      return {
        outcome: { kind: "created" },
        durationMs: performance.now() - start,
        applicationId: request.applicationId,
      };
    }

    abortIfNeeded(signal);
    opts.onStep("analyze", "running", "Nouvelle vérification du projet…");
    const analysis = await b.androidPreparation.inspect(cwd);
    if (analysis.status === "ready") {
      opts.onStep("analyze", "success", "Le projet Android est déjà prêt.");
      for (const id of ["dependencies", "configure", "web", "add", "sync", "verify"]) {
        opts.onStep(id, "skipped");
      }
      return {
        outcome: { kind: "already-ready" },
        durationMs: performance.now() - start,
        applicationId: analysis.applicationId,
      };
    }
    if (analysis.status === "blocked") {
      opts.onStep("analyze", "error", analysis.blockers[0] || "Projet incompatible.");
      return {
        outcome: {
          kind: "failed",
          message:
            analysis.blockers.join("\n") || "Ce projet ne peut pas être préparé automatiquement.",
        },
        durationMs: performance.now() - start,
        applicationId: request.applicationId,
      };
    }
    if (analysis.packageManager !== request.packageManager) {
      opts.onStep("analyze", "error", "Le gestionnaire de paquets a changé depuis l’analyse.");
      return {
        outcome: { kind: "failed", message: "Relancez l’analyse avant de recommencer." },
        durationMs: performance.now() - start,
        applicationId: request.applicationId,
      };
    }
    opts.onStep("analyze", "success", `Projet compatible · ${analysis.packageManager}.`);

    abortIfNeeded(signal);
    opts.onStep("dependencies", "running", "Installation des dépendances du projet…");
    const install = dependencyInstall(request.packageManager);
    const installed = await exec(project, install.cmd, install.args, cwd, opts.onLine, signal);
    if (installed.exitCode !== 0) {
      return failStep(
        opts,
        "dependencies",
        `L’installation avec ${request.packageManager} a échoué.`,
        installed,
        start,
        request.applicationId,
      );
    }
    if (!analysis.hasCapacitorCore || !analysis.hasCapacitorCli || !analysis.hasCapacitorAndroid) {
      opts.onLine?.("Installation des composants Capacitor Android…");
      const capInstall = capacitorInstall(request.packageManager);
      const capInstalled = await exec(
        project,
        capInstall.cmd,
        capInstall.args,
        cwd,
        opts.onLine,
        signal,
      );
      if (capInstalled.exitCode !== 0) {
        return failStep(
          opts,
          "dependencies",
          "L’installation de Capacitor a échoué.",
          capInstalled,
          start,
          request.applicationId,
        );
      }
    }
    opts.onStep("dependencies", "success", "Dépendances prêtes.");

    abortIfNeeded(signal);
    opts.onStep("configure", "running", "Configuration de Capacitor…");
    const config = await b.androidPreparation.createConfig(cwd, request);
    opts.onStep(
      "configure",
      config.created ? "success" : "skipped",
      config.created
        ? "capacitor.config.json créé et vérifié."
        : "Configuration existante conservée.",
    );

    abortIfNeeded(signal);
    opts.onStep("web", "running", `Compilation du projet web vers ${request.webDir}/…`);
    const build = webBuild(request.packageManager);
    const built = await exec(project, build.cmd, build.args, cwd, opts.onLine, signal);
    if (built.exitCode !== 0) {
      return failStep(opts, "web", "Le build web a échoué.", built, start, request.applicationId);
    }
    if (!(await b.fs.exists(`${cwd}/${request.webDir}/index.html`))) {
      opts.onStep("web", "error", `Aucun index.html trouvé dans ${request.webDir}/.`);
      return {
        outcome: {
          kind: "failed",
          message: `Le build est terminé, mais ${request.webDir}/index.html est introuvable. Vérifiez le dossier de sortie web.`,
        },
        durationMs: performance.now() - start,
        applicationId: request.applicationId,
      };
    }
    opts.onStep("web", "success", "Application web compilée.");

    abortIfNeeded(signal);
    opts.onStep("add", "running", "Création du projet Android…");
    const added = await exec(project, "npx", ["cap", "add", "android"], cwd, opts.onLine, signal);
    if (added.exitCode !== 0) {
      return failStep(
        opts,
        "add",
        "La création du dossier Android a échoué.",
        added,
        start,
        request.applicationId,
      );
    }
    opts.onStep("add", "success", "Projet Android créé.");

    abortIfNeeded(signal);
    opts.onStep("sync", "running", "Synchronisation des ressources web…");
    const synced = await exec(project, "npx", ["cap", "sync", "android"], cwd, opts.onLine, signal);
    if (synced.exitCode !== 0) {
      return failStep(
        opts,
        "sync",
        "La synchronisation Capacitor a échoué.",
        synced,
        start,
        request.applicationId,
      );
    }
    opts.onStep("sync", "success", "Ressources synchronisées.");

    abortIfNeeded(signal);
    opts.onStep("verify", "running", "Compilation Android de contrôle…");
    const executable = await b.gradle.ensureExecutable(cwd);
    if (!executable.ok) {
      opts.onStep("verify", "error", "Le wrapper Gradle n’est pas utilisable.");
      return {
        outcome: {
          kind: "failed",
          message: "Le projet Android a été créé, mais gradlew n’est pas utilisable.",
        },
        durationMs: performance.now() - start,
        applicationId: request.applicationId,
      };
    }
    const system = await b.system.detect();
    const gradleCommand = system.platform === "win32" ? "gradlew.bat" : "gradlew";
    const verified = await exec(
      project,
      gradleCommand,
      ["assembleDebug"],
      `${cwd}/android`,
      opts.onLine,
      signal,
      20 * 60_000,
    );
    if (verified.exitCode !== 0) {
      return failStep(
        opts,
        "verify",
        "La compilation Android de contrôle a échoué.",
        verified,
        start,
        request.applicationId,
      );
    }
    const debugArtifact = `${cwd}/android/app/build/outputs/apk/debug/app-debug.apk`;
    opts.onStep("verify", "success", "Android compilé avec succès.");

    return {
      outcome: {
        kind: "created",
        debugArtifact: (await b.fs.exists(debugArtifact)) ? debugArtifact : undefined,
      },
      durationMs: performance.now() - start,
      applicationId: request.applicationId,
    };
  },
};
