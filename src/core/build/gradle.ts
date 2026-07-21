import { bridge } from "@/core/bridge";

/**
 * Sélection unique et centralisée du wrapper Gradle selon le système.
 * Aucun composant UI ne doit connaître la différence Windows / Unix.
 */

export interface GradleInvocation {
  cmd: string;
  args: string[];
  cwd: string;
  /** Le wrapper trouvé sur le disque (ou "global" en repli). */
  wrapper: "windows" | "unix" | "global";
}

export interface GradleResolution {
  androidDir: string;
  platform: "darwin" | "win32" | "linux" | "web";
  hasWrapperUnix: boolean;
  hasWrapperWin: boolean;
  wrapperExists: boolean;
  /** Le wrapper attendu pour la plateforme (chemin absolu). */
  expectedWrapperPath: string;
  /** true si l'invocation est déterminée sans repli global. */
  canRun: boolean;
  /** Invocation prête à l'emploi (préfère wrapper local, sinon `gradle`). */
  invocation: GradleInvocation | null;
}

export async function resolveGradle(projectPath: string): Promise<GradleResolution> {
  const b = bridge();
  const androidDir = `${projectPath}/android`;
  const sys = await b.system.detect().catch(() => null);
  const platform = (sys?.platform ?? "linux") as GradleResolution["platform"];
  const isWindows = platform === "win32";

  const wrapperUnix = `${androidDir}/gradlew`;
  const wrapperWin = `${androidDir}/gradlew.bat`;
  const [hasWrapperUnix, hasWrapperWin] = await Promise.all([
    b.fs.exists(wrapperUnix),
    b.fs.exists(wrapperWin),
  ]);

  const expectedWrapperPath = isWindows ? wrapperWin : wrapperUnix;
  const wrapperExists = isWindows ? hasWrapperWin : hasWrapperUnix;

  let invocation: GradleInvocation | null = null;
  if (isWindows && hasWrapperWin) {
    invocation = { cmd: "gradlew.bat", args: ["bundleRelease"], cwd: androidDir, wrapper: "windows" };
  } else if (!isWindows && hasWrapperUnix) {
    invocation = { cmd: "./gradlew", args: ["bundleRelease"], cwd: androidDir, wrapper: "unix" };
  }

  return {
    androidDir,
    platform,
    hasWrapperUnix,
    hasWrapperWin,
    wrapperExists,
    expectedWrapperPath,
    canRun: !!invocation,
    invocation,
  };
}

/**
 * Rend le wrapper Unix exécutable — no-op sous Windows / si absent.
 * Ne remonte jamais d'erreur : l'appelant décide.
 */
export async function ensureGradleExecutable(projectPath: string): Promise<boolean> {
  const b = bridge();
  const res = await resolveGradle(projectPath);
  if (res.platform === "win32") return true;
  if (!res.hasWrapperUnix) return false;
  try {
    const r = await b.exec.run({
      cmd: "chmod",
      args: ["+x", "gradlew"],
      cwd: res.androidDir,
      timeoutMs: 10_000,
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Repli global : `gradle -v` disponible dans le PATH ?
 */
export async function hasGlobalGradle(cwd: string): Promise<boolean> {
  try {
    const r = await bridge().exec.run({
      cmd: "gradle",
      args: ["-v"],
      cwd,
      timeoutMs: 10_000,
    });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}
