import type { Project } from "@/core/types";
import { bridge } from "@/core/bridge";
import { JournalService } from "@/core/journal/logger";
import { SigningInjector } from "./signing-injector";
import { SigningValidator } from "@/features/android-signing/services/signing-validator";
import { ProfilesStore } from "@/features/android-signing/storage/profiles-store";

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
  /** true si le .aab a été signé avec le profil lié au projet. */
  signed?: boolean;
  signingProfileName?: string;
  signatureSha256?: string;
  sourceCommit?: string;
  sourceDirty?: boolean;
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
  signingSessionId?: string,
) {
  abortIfNeeded(signal);
  const b = bridge();
  const result = await b.exec.run(
    { cmd, args, cwd, signingSessionId, timeoutMs: 30 * 60_000 },
    (l) => onLine?.(l.line),
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
  if (result.aborted || signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
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
        sourceCommit: project.source?.headSha,
        sourceDirty: project.source?.workingTree === "dirty",
      };
    }

    // Vérifie la référence avant npm, Capacitor ou Gradle. Le préflight UI
    // effectue le même contrôle, mais le moteur doit rester sûr lorsqu'il est
    // appelé depuis un autre parcours ou si le stockage change entre-temps.
    const signingProfile = SigningInjector.resolveProfile(project);
    if (!signingProfile.ok) {
      opts.onStep("prepare", "error", signingProfile.error.message);
      JournalService.log("error", signingProfile.error.message, {
        projectId: project.id,
        code: signingProfile.error.code,
      });
      throw new Error(signingProfile.error.message);
    }

    // Fige l'origine exacte avant toute commande de build. Un arbre modifié
    // reste constructible, mais l'historique le signalera explicitement afin
    // de ne jamais présenter le SHA seul comme une reproduction parfaite.
    let sourceCommit: string | undefined;
    let sourceDirty = false;
    if (project.source?.type === "git") {
      const gitStatus = await b.git.status({
        projectPath: project.localPath,
        remoteUrl: project.source.remoteUrl,
        branch: project.source.branch,
      });
      sourceCommit = gitStatus.headSha;
      sourceDirty = gitStatus.workingTree === "dirty";
      opts.onLine?.(
        `Source Git : ${gitStatus.branch} @ ${gitStatus.shortSha}${sourceDirty ? " (modifications locales)" : ""}`,
      );
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

    // 4. Signature — le main process prépare une session opaque puis injecte
    //    lui-même les variables Gradle. Aucun mot de passe ne revient à React.
    abortIfNeeded(signal);
    const { resolveGradle, ensureGradleExecutable, hasGlobalGradle } = await import("./gradle");
    const gradleRes = await resolveGradle(project.localPath);
    const androidDir = gradleRes.androidDir;
    const diagnostic = (line: string, level: "info" | "error" = "info") => {
      opts.onLine?.(line);
      JournalService.log(level, line);
    };
    diagnostic("### Diagnostic de signature");
    diagnostic(`✓ Projet : ${project.localPath}`);
    diagnostic(`✓ Dossier Android : ${androidDir}`);

    const prep = await SigningInjector.prepare(project);
    if (!prep.ok) {
      diagnostic(`✗ ${prep.error.message}`, "error");
      opts.onStep("gradle", "error", prep.error.message);
      throw new Error(prep.error.message);
    }
    const patch = await SigningInjector.ensureGradlePatched(androidDir);
    diagnostic(`${patch.exists ? "✓" : "✗"} build.gradle : ${patch.gradlePath}`);
    diagnostic(
      `${patch.status === "write-failed" || patch.status === "gradle-missing" ? "✗" : "✓"} Statut du patch : ${patch.status}`,
    );
    diagnostic(
      `${patch.inspection.hasAppPublisherRelease ? "✓" : "✗"} Bloc appPublisherRelease après écriture`,
    );
    diagnostic(
      `Configurations détectées : ${patch.inspection.signingConfigs.join(", ") || "aucune"}`,
    );
    diagnostic(
      `Affectations signingConfig détectées : ${patch.inspection.releaseAssignments.join(" → ") || "aucune"}`,
    );
    diagnostic(
      `Anciens storeFile détectés : ${patch.inspection.legacyStoreFiles.join(", ") || "aucun"}`,
    );
    diagnostic(
      `${patch.inspection.releaseUsesAppPublisher ? "✓" : "✗"} Build type release → appPublisherRelease`,
    );
    diagnostic(
      `${patch.inspection.hasDeferredSigningOverride ? "✗" : "✓"} Aucune réaffectation différée de signingConfig`,
    );
    diagnostic(`✓ Profil : ${prep.preparation.profileName}`);
    diagnostic(`✓ Alias : ${prep.preparation.alias}`);
    diagnostic(`✓ Keystore enregistré : ${prep.preparation.storedKeystorePath}`);
    diagnostic(
      `${prep.preparation.storedPathWasAbsolute ? "✓" : "!"} Chemin enregistré ${prep.preparation.storedPathWasAbsolute ? "absolu" : "relatif — normalisé avant Gradle"}`,
    );
    diagnostic(`✓ Chemin final transmis à Gradle : ${prep.preparation.keystorePath}`);
    diagnostic(`✓ Fichier trouvé et lisible`);

    if (patch.status === "gradle-missing") {
      diagnostic("✗ build.gradle introuvable.", "error");
      opts.onStep("gradle", "error", "android/app/build.gradle est introuvable.");
      throw new Error("android/app/build.gradle est introuvable.");
    }
    if (patch.status === "write-failed") {
      diagnostic("✗ Écriture ou relecture du patch impossible.", "error");
      const detail =
        patch.errorCode === "managed-block-corrupt"
          ? "Le bloc de signature AppPublisher existant est incomplet ou dupliqué. Restaurez build.gradle depuis une sauvegarde avant de relancer."
          : "Impossible d'écrire la configuration de signature dans build.gradle.";
      opts.onStep("gradle", "error", detail);
      throw new Error(detail);
    }
    if (
      !patch.inspection.hasAppPublisherRelease ||
      !patch.inspection.releaseUsesAppPublisher ||
      patch.inspection.hasDeferredSigningOverride
    ) {
      diagnostic("✗ Le build type release n'utilise pas appPublisherRelease.", "error");
      opts.onStep(
        "gradle",
        "error",
        "La configuration Gradle AppPublisher n'est pas active pour le build release.",
      );
      throw new Error(
        patch.inspection.hasDeferredSigningOverride
          ? "Une configuration Gradle différée (afterEvaluate) peut remplacer la signature AppPublisher. Retirez cette réaffectation avant de relancer."
          : "La configuration Gradle AppPublisher n'est pas active pour le build release.",
      );
    }

    diagnostic(`✓ APP_KEYSTORE_FILE : présent (${prep.preparation.keystorePath})`);
    diagnostic(`✓ APP_KEY_ALIAS : présent (${prep.preparation.alias})`);
    diagnostic("✓ Mots de passe conservés dans le processus principal");
    diagnostic("✓ Session Gradle mono-usage préparée");

    // 5. Gradle bundleRelease — sélection multi-plateforme centralisée.
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
      const executable = await ensureGradleExecutable(project.localPath);
      if (!executable)
        throw new Error(
          `Le wrapper Gradle n'est pas exécutable : ${gradleRes.expectedWrapperPath}`,
        );
    }

    diagnostic(`✓ Commande Gradle : ${invocation.cmd} ${invocation.args.join(" ")}`);
    diagnostic(`✓ Gradle lancé depuis ${invocation.cwd}`);

    opts.onStep("gradle", "running", "Fabrication du fichier Android signé…");
    const gradle = await run(
      project,
      invocation.cmd,
      invocation.args,
      invocation.cwd,
      opts.onLine,
      signal,
      prep.preparation.signingSessionId,
    );
    if (gradle.exitCode !== 0) {
      opts.onStep("gradle", "error", "La construction Android a échoué.");
      throw new Error(gradle.stderr || gradle.stdout);
    }
    opts.onStep(
      "gradle",
      "success",
      `Fichier Android signé (« ${prep.preparation.profileName} »).`,
    );

    // 6. Localisation de l'artefact
    abortIfNeeded(signal);
    opts.onStep("artifact", "running", "Recherche du fichier final…");
    const aabs = await b.fs.findByExtension(
      `${androidDir}/app/build/outputs/bundle/release`,
      ".aab",
      3,
    );
    if (!aabs.length) {
      opts.onStep("artifact", "error", "Fichier .aab introuvable après la construction.");
      throw new Error("Gradle a terminé sans produire de fichier AAB.");
    }
    const aab = aabs.find((candidate) => /[\\/]app-release\.aab$/i.test(candidate)) ?? aabs[0];
    const stat = await b.fs.stat(aab);
    if (!stat?.isFile || stat.size <= 0) {
      opts.onStep("artifact", "error", "Le fichier AAB produit est vide ou illisible.");
      throw new Error("Le fichier AAB produit est vide ou illisible.");
    }
    diagnostic(`✓ AAB trouvé : ${aab} (${stat.size} octets)`);
    const verified = await b.signing.verifyAab(aab);
    if (!verified.ok) {
      opts.onStep("artifact", "error", "La vérification de signature du fichier AAB a échoué.");
      throw new Error(verified.errorHint ?? "La signature du fichier AAB n'est pas valide.");
    }
    diagnostic(`✓ Signature AAB vérifiée avec jarsigner`);
    if (verified.certificate) diagnostic(`✓ Certificat : ${verified.certificate}`);
    if (verified.sha256) diagnostic(`✓ Empreinte SHA-256 : ${verified.sha256}`);
    const profile = ProfilesStore.get(prep.preparation.profileId);
    const expectedSha = profile?.certificate?.sha256?.replace(/\s+/g, "").toUpperCase();
    if (expectedSha && verified.sha256 && expectedSha !== verified.sha256) {
      opts.onStep(
        "artifact",
        "error",
        "Le certificat de l'AAB ne correspond pas au profil de signature.",
      );
      throw new Error(
        `L'empreinte SHA-256 de l'AAB ne correspond pas au profil « ${prep.preparation.profileName} ».`,
      );
    }
    if (expectedSha) diagnostic(`✓ Empreinte conforme au profil`);
    opts.onStep("artifact", "success", "AAB trouvé et signature vérifiée.");

    // Trace la dernière utilisation du profil (aucun secret impliqué).
    SigningValidator.markUsed(prep.preparation.profileId);

    return {
      aabPath: aab,
      aabSize: stat?.size,
      durationMs: performance.now() - start,
      succeeded: true,
      signed: true,
      signingProfileName: prep.preparation.profileName,
      signatureSha256: verified.sha256,
      sourceCommit,
      sourceDirty,
    };
  },
};
