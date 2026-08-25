const fs = require("fs");
const os = require("os");
const path = require("path");

function isDirectory(candidate, fsModule = fs) {
  if (!candidate) return false;
  try {
    return fsModule.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function defaultAndroidSdkCandidates(platform, homeDir, env) {
  if (platform === "darwin") return [path.join(homeDir, "Library", "Android", "sdk")];
  if (platform === "win32") {
    return env.LOCALAPPDATA ? [path.join(env.LOCALAPPDATA, "Android", "Sdk")] : [];
  }
  return [path.join(homeDir, "Android", "Sdk")];
}

function resolveAndroidSdkPath(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const fsModule = options.fsModule ?? fs;
  const candidates = [
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    ...defaultAndroidSdkCandidates(platform, homeDir, env),
  ];
  return candidates.find((candidate) => isDirectory(candidate, fsModule));
}

function appendPath(env, candidate, delimiter = path.delimiter) {
  if (!isDirectory(candidate)) return;
  const entries = String(env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean);
  if (!entries.includes(candidate)) entries.push(candidate);
  env.PATH = entries.join(delimiter);
}

function configureAndroidSdkEnvironment(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const sdkPath = resolveAndroidSdkPath({ ...options, env, platform });
  if (!sdkPath) return undefined;

  // Gradle ne bénéficie pas de la détection utilisée par l'écran Diagnostic :
  // il lit ces variables dans l'environnement du processus enfant.
  env.ANDROID_HOME = sdkPath;
  env.ANDROID_SDK_ROOT = sdkPath;
  appendPath(env, path.join(sdkPath, "platform-tools"), platform === "win32" ? ";" : ":");
  return sdkPath;
}

module.exports = {
  configureAndroidSdkEnvironment,
  defaultAndroidSdkCandidates,
  resolveAndroidSdkPath,
};
