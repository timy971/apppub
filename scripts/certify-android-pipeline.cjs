const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildValidationReport,
  inspectAabArchive,
  normalizeFingerprint,
} = require("../electron/aab-inspector.cjs");
const { AndroidCorrectionManager } = require("../electron/android-corrections.cjs");
const { buildPatchedGradle } = require("../electron/gradle-signing-patch.cjs");

const PACKAGE_NAME = "com.apppublisher.certification";
const RELEASES = Object.freeze([
  { name: "1.0.0", code: 100 },
  { name: "1.0.1", code: 101 },
]);

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: options.capture === false ? "inherit" : ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const status = Number.isInteger(error?.status) ? ` (exit ${error.status})` : "";
    throw new Error(`${path.basename(command)} failed${status}.`);
  }
}

function parseSha256(output) {
  return normalizeFingerprint(String(output).match(/SHA[\s-]?256\s*:\s*([0-9A-Fa-f: ]+)/i)?.[1]);
}

function certificateForAab(aabPath, runner = run) {
  const verification = runner("jarsigner", ["-verify", "-verbose", "-certs", aabPath]);
  if (!/jar verified\.|jar vérifié\./i.test(String(verification))) {
    throw new Error("jarsigner did not confirm the AAB signature.");
  }
  const certificate = runner("keytool", [
    "-J-Duser.language=en",
    "-printcert",
    "-jarfile",
    aabPath,
  ]);
  const sha256 = parseSha256(certificate);
  if (!sha256) throw new Error("The AAB signing certificate SHA-256 could not be read.");
  const owner = String(certificate)
    .match(/^\s*Owner\s*:\s*(.+)$/im)?.[1]
    ?.trim();
  return { ok: true, sha256, certificate: owner };
}

function validateBundle(aabPath, bundletoolJar, runner = run) {
  if (!bundletoolJar || !fs.existsSync(bundletoolJar) || !fs.statSync(bundletoolJar).isFile()) {
    throw new Error("APPPUBLISHER_BUNDLETOOL_JAR must point to the pinned bundletool JAR.");
  }
  const version = String(runner("java", ["-jar", bundletoolJar, "version"]))
    .trim()
    .split(/\r?\n/)[0];
  runner("java", ["-jar", bundletoolJar, "validate", `--bundle=${aabPath}`]);
  return { status: "passed", version };
}

function assertReleaseSequence(reports) {
  if (!Array.isArray(reports) || reports.length !== 2) {
    throw new Error("Certification requires exactly two Android releases.");
  }
  if (reports.some((report) => report.verdict !== "ready")) {
    throw new Error("Every AAB must receive the AppPublisher ready verdict.");
  }
  if (reports[1].versionCode <= reports[0].versionCode) {
    throw new Error("The second versionCode must be strictly greater than the first.");
  }
  if (!reports[0].signerSha256 || reports[0].signerSha256 !== reports[1].signerSha256) {
    throw new Error("Both AAB files must use the same signing certificate.");
  }
  if (reports[0].artifactSha256 === reports[1].artifactSha256) {
    throw new Error("The two release artifacts must be distinct.");
  }
  return true;
}

function safeOutputDirectory(input, repositoryRoot) {
  const output = path.resolve(repositoryRoot, input || ".artifacts/android-certification");
  if (output === repositoryRoot || !output.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error("The certification output directory must stay inside the repository.");
  }
  return output;
}

function certify(options = {}) {
  const repositoryRoot = path.resolve(__dirname, "..");
  const fixture = path.join(repositoryRoot, "tests", "fixtures", "android-reference");
  const output = safeOutputDirectory(options.output ?? process.argv[2], repositoryRoot);
  const bundletoolJar = path.resolve(
    options.bundletoolJar ?? process.env.APPPUBLISHER_BUNDLETOOL_JAR ?? "",
  );
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "apppublisher-android-certification-"));
  const project = path.join(temporary, "project");
  const keystore = path.join(temporary, "ephemeral-certification.jks");
  const password = `cert-${process.pid}-${Date.now()}-Aa1!`;
  const alias = "apppublisher-certification";
  let stage = "initialize";

  fs.mkdirSync(output, { recursive: true });
  for (const file of [
    "certification-report.json",
    "release-100.aab",
    "release-100.aab.apppublisher-report.json",
    "release-101.aab",
    "release-101.aab.apppublisher-report.json",
  ]) {
    fs.rmSync(path.join(output, file), { force: true });
  }
  fs.cpSync(fixture, project, { recursive: true });

  try {
    stage = "install-capacitor-fixture";
    run("npm", ["ci", "--ignore-scripts"], {
      cwd: project,
      env: { ...process.env, npm_config_cache: path.join(temporary, "npm-cache") },
    });
    run("npx", ["cap", "add", "android"], { cwd: project });
    run("npx", ["cap", "sync", "android"], { cwd: project });
    stage = "patch-gradle-signing";
    const androidDirectory = path.join(project, "android");
    const gradleFile = path.join(androidDirectory, "app", "build.gradle");
    const signingPatch = buildPatchedGradle(fs.readFileSync(gradleFile, "utf8"));
    if (!signingPatch.ok)
      throw new Error("AppPublisher could not patch the reference Gradle file.");
    fs.writeFileSync(gradleFile, signingPatch.content, "utf8");

    const access = {
      resolveExisting(input) {
        const resolved = path.resolve(input);
        if (resolved !== project && !resolved.startsWith(`${project}${path.sep}`)) return null;
        return fs.existsSync(resolved) ? resolved : null;
      },
    };
    const corrections = new AndroidCorrectionManager(access);
    const gradleCommand =
      options.gradleCommand ??
      process.env.APPPUBLISHER_CERT_GRADLE ??
      path.join(androidDirectory, process.platform === "win32" ? "gradlew.bat" : "gradlew");

    stage = "generate-ephemeral-keystore";
    run("keytool", [
      "-J-Duser.language=en",
      "-genkeypair",
      "-noprompt",
      "-keystore",
      keystore,
      "-storepass",
      password,
      "-keypass",
      password,
      "-alias",
      alias,
      "-keyalg",
      "RSA",
      "-keysize",
      "3072",
      "-validity",
      "365",
      "-dname",
      "CN=AppPublisher CI, O=Ephemeral Test, C=FR",
    ]);

    const reports = [];
    for (const release of RELEASES) {
      stage = `release-${release.code}-version`;
      const correction = corrections.preview(project, {
        versionName: release.name,
        versionCode: release.code,
      });
      if (!correction.canApply) {
        throw new Error(
          correction.blocked[0] ?? "AppPublisher could not update the release version.",
        );
      }
      corrections.apply(project, correction.desired, correction.token);

      stage = `release-${release.code}-build`;
      run(gradleCommand, ["--no-daemon", "--stacktrace", "bundleRelease"], {
        capture: false,
        cwd: androidDirectory,
        env: {
          ...process.env,
          GRADLE_USER_HOME:
            process.env.GRADLE_USER_HOME ?? path.join(temporary, "gradle-user-home"),
          ANDROID_USER_HOME:
            process.env.ANDROID_USER_HOME ?? path.join(temporary, "android-user-home"),
          ORG_GRADLE_PROJECT_APP_KEYSTORE_FILE: keystore,
          ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD: password,
          ORG_GRADLE_PROJECT_APP_KEY_ALIAS: alias,
          ORG_GRADLE_PROJECT_APP_KEY_PASSWORD: password,
        },
      });

      const builtAab = path.join(
        androidDirectory,
        "app",
        "build",
        "outputs",
        "bundle",
        "release",
        "app-release.aab",
      );
      if (!fs.existsSync(builtAab)) throw new Error("Gradle did not produce app-release.aab.");
      const aabName = `release-${release.code}.aab`;
      const aabPath = path.join(output, aabName);
      fs.copyFileSync(builtAab, aabPath);

      stage = `release-${release.code}-inspect`;
      const archive = inspectAabArchive(aabPath);
      const signature = certificateForAab(aabPath);
      const bundletool = validateBundle(aabPath, bundletoolJar);
      const report = buildValidationReport({
        archive,
        signature,
        bundletool,
        inspectedAt: new Date().toISOString(),
        expected: {
          packageName: PACKAGE_NAME,
          versionName: release.name,
          versionCode: release.code,
          signerSha256: signature.sha256,
        },
      });
      const reportName = `${aabName}.apppublisher-report.json`;
      fs.writeFileSync(path.join(output, reportName), `${JSON.stringify(report, null, 2)}\n`, {
        mode: 0o600,
      });
      reports.push(report);
    }

    stage = "compare-releases";
    assertReleaseSequence(reports);
    const summary = {
      schemaVersion: 1,
      certifiedAt: new Date().toISOString(),
      status: "certified",
      packageName: PACKAGE_NAME,
      releaseCount: reports.length,
      signerSha256: reports[0].signerSha256,
      versionCodes: reports.map((report) => report.versionCode),
      bundletoolVersion: reports[0].bundletool.version,
      releases: reports.map((report) => ({
        versionName: report.versionName,
        versionCode: report.versionCode,
        verdict: report.verdict,
        artifactSha256: report.artifactSha256,
        signatureValid: report.signatureValid,
      })),
    };
    fs.writeFileSync(
      path.join(output, "certification-report.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      { mode: 0o600 },
    );
    process.stdout.write(
      `Android pipeline certified: ${summary.versionCodes.join(" -> ")} · same certificate · 2 ready AAB files\n`,
    );
    return summary;
  } catch (error) {
    const failure = {
      schemaVersion: 1,
      certifiedAt: new Date().toISOString(),
      status: "failed",
      packageName: PACKAGE_NAME,
      failedStage: stage,
      message: error instanceof Error ? error.message : "Unknown certification failure.",
    };
    fs.writeFileSync(
      path.join(output, "certification-report.json"),
      `${JSON.stringify(failure, null, 2)}\n`,
      { mode: 0o600 },
    );
    throw error;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    certify();
  } catch (error) {
    process.stderr.write(`Android pipeline certification failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertReleaseSequence,
  certificateForAab,
  parseSha256,
  safeOutputDirectory,
  validateBundle,
};
