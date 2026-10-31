const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const os = require("node:os");

const DEFAULT_API_LEVEL = 36;
const DEFAULT_BUILD_TOOLS = "36.0.0";

function androidSdkCandidates(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homedir = options.homedir ?? os.homedir();
  const candidates = [];

  if (env.ANDROID_HOME) candidates.push(env.ANDROID_HOME);
  if (env.ANDROID_SDK_ROOT) candidates.push(env.ANDROID_SDK_ROOT);

  if (platform === "darwin") {
    candidates.push(path.join(homedir, "Library", "Android", "sdk"));
  } else if (platform === "win32") {
    candidates.push(path.join(env.LOCALAPPDATA || "", "Android", "Sdk"));
  } else {
    candidates.push(
      path.join(homedir, "Android", "Sdk"),
      path.join(homedir, "Android", "sdk"),
    );
  }

  if (Array.isArray(options.extraCandidates)) candidates.push(...options.extraCandidates);
  return [...new Set(candidates.filter(Boolean))];
}

function resolveAndroidSdkPath(options = {}) {
  const fsModule = options.fsModule ?? fs;
  for (const candidate of androidSdkCandidates(options)) {
    try {
      if (!fsModule.statSync(candidate).isDirectory()) continue;
      try {
        return fsModule.realpathSync(candidate);
      } catch {
        return path.resolve(candidate);
      }
    } catch {}
  }
  return undefined;
}

function requiredAndroidPackages(options = {}) {
  const apiLevel = Number.isInteger(options.apiLevel) ? options.apiLevel : DEFAULT_API_LEVEL;
  const buildToolsVersion =
    typeof options.buildToolsVersion === "string" && options.buildToolsVersion.trim()
      ? options.buildToolsVersion.trim()
      : DEFAULT_BUILD_TOOLS;
  return [
    "platform-tools",
    `platforms;android-${apiLevel}`,
    `build-tools;${buildToolsVersion}`,
  ];
}

function sdkmanagerCandidates(sdkPath, options = {}) {
  if (!sdkPath) return [];
  const fsModule = options.fsModule ?? fs;
  const platform = options.platform ?? process.platform;
  const executable = platform === "win32" ? "sdkmanager.bat" : "sdkmanager";
  const candidates = [
    path.join(sdkPath, "cmdline-tools", "latest", "bin", executable),
    path.join(sdkPath, "tools", "bin", executable),
  ];
  try {
    const cmdlineRoot = path.join(sdkPath, "cmdline-tools");
    const versions = fsModule
      .readdirSync(cmdlineRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "latest")
      .map((entry) => entry.name)
      .sort()
      .reverse();
    for (const version of versions) {
      candidates.push(path.join(cmdlineRoot, version, "bin", executable));
    }
  } catch {}
  return [...new Set(candidates)];
}

function findSdkmanager(sdkPath, options = {}) {
  const fsModule = options.fsModule ?? fs;
  for (const candidate of sdkmanagerCandidates(sdkPath, options)) {
    try {
      if (fsModule.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return undefined;
}

function packageInstalled(sdkPath, packageName, options = {}) {
  const fsModule = options.fsModule ?? fs;
  const platform = options.platform ?? process.platform;
  if (packageName === "platform-tools") {
    const adb = platform === "win32" ? "adb.exe" : "adb";
    return fsModule.existsSync(path.join(sdkPath, "platform-tools", adb));
  }
  if (packageName.startsWith("platforms;android-")) {
    const api = packageName.slice("platforms;android-".length);
    return fsModule.existsSync(path.join(sdkPath, "platforms", `android-${api}`, "android.jar"));
  }
  if (packageName.startsWith("build-tools;")) {
    const version = packageName.slice("build-tools;".length);
    const aapt2 = platform === "win32" ? "aapt2.exe" : "aapt2";
    return fsModule.existsSync(path.join(sdkPath, "build-tools", version, aapt2));
  }
  return false;
}

function inspectAndroidSdk(sdkPath, options = {}) {
  if (!sdkPath) {
    return {
      present: false,
      ready: false,
      installable: false,
      sdkPath: undefined,
      sdkmanagerPath: undefined,
      requiredPackages: requiredAndroidPackages(options),
      missingPackages: requiredAndroidPackages(options),
      reason: "sdk-missing",
    };
  }
  const fsModule = options.fsModule ?? fs;
  let present = false;
  try {
    present = fsModule.statSync(sdkPath).isDirectory();
  } catch {}
  const requiredPackages = requiredAndroidPackages(options);
  if (!present) {
    return {
      present: false,
      ready: false,
      installable: false,
      sdkPath,
      sdkmanagerPath: undefined,
      requiredPackages,
      missingPackages: requiredPackages,
      reason: "sdk-missing",
    };
  }
  const missingPackages = requiredPackages.filter(
    (packageName) => !packageInstalled(sdkPath, packageName, options),
  );
  const sdkmanagerPath = findSdkmanager(sdkPath, options);
  return {
    present: true,
    ready: missingPackages.length === 0,
    installable: missingPackages.length > 0 && Boolean(sdkmanagerPath),
    sdkPath,
    sdkmanagerPath,
    requiredPackages,
    missingPackages,
    reason:
      missingPackages.length === 0
        ? "ready"
        : sdkmanagerPath
          ? "components-missing"
          : "command-line-tools-missing",
  };
}

function allowedPackage(packageName) {
  return (
    packageName === "platform-tools" ||
    /^platforms;android-\d+$/.test(packageName) ||
    /^build-tools;\d+(?:\.\d+){1,2}$/.test(packageName)
  );
}

function installAndroidSdkPackages(sdkPath, packages, options = {}) {
  const state = inspectAndroidSdk(sdkPath, options);
  if (!state.present) {
    return Promise.resolve({ ok: false, errorCode: "sdk-missing", state });
  }
  if (!state.sdkmanagerPath) {
    return Promise.resolve({ ok: false, errorCode: "command-line-tools-missing", state });
  }
  const requested = [...new Set((packages || []).filter(allowedPackage))];
  if (!requested.length) {
    return Promise.resolve({ ok: true, installed: [], state });
  }
  const spawnImpl = options.spawnImpl ?? spawn;
  const env = {
    ...(options.env ?? process.env),
    ANDROID_HOME: sdkPath,
    ANDROID_SDK_ROOT: sdkPath,
  };
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let child;
    try {
      child = spawnImpl(
        state.sdkmanagerPath,
        [`--sdk_root=${sdkPath}`, ...requested],
        { cwd: sdkPath, env, shell: false },
      );
    } catch (error) {
      resolve({
        ok: false,
        errorCode: "install-spawn-failed",
        errorHint: error instanceof Error ? error.message : String(error),
        state,
      });
      return;
    }
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      resolve({
        ok: false,
        errorCode: "install-spawn-failed",
        errorHint: error instanceof Error ? error.message : String(error),
        state,
      });
    });
    child.on("close", (code) => {
      const nextState = inspectAndroidSdk(sdkPath, options);
      resolve({
        ok: code === 0 && requested.every((name) => !nextState.missingPackages.includes(name)),
        errorCode: code === 0 ? undefined : "install-failed",
        exitCode: code,
        installed: requested.filter((name) => !nextState.missingPackages.includes(name)),
        requested,
        stdout: stdout.slice(-8000),
        stderr: stderr.slice(-8000),
        state: nextState,
      });
    });
    if (child.stdin) {
      child.stdin.write("y\n".repeat(20));
      child.stdin.end();
    }
  });
}

module.exports = {
  DEFAULT_API_LEVEL,
  DEFAULT_BUILD_TOOLS,
  allowedPackage,
  androidSdkCandidates,
  findSdkmanager,
  inspectAndroidSdk,
  installAndroidSdkPackages,
  packageInstalled,
  requiredAndroidPackages,
  resolveAndroidSdkPath,
  sdkmanagerCandidates,
};
