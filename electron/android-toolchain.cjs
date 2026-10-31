const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function javaBinary(home, platform = process.platform, name = "java") {
  const extension = platform === "win32" ? ".exe" : "";
  return path.join(home, "bin", name + extension);
}

function validJavaHome(home, options = {}) {
  const fsModule = options.fsModule ?? fs;
  const platform = options.platform ?? process.platform;
  if (typeof home !== "string" || !home.trim()) return false;
  try {
    return (
      fsModule.statSync(javaBinary(home, platform, "java")).isFile() &&
      fsModule.statSync(javaBinary(home, platform, "keytool")).isFile()
    );
  } catch {
    return false;
  }
}

function javaHomeCandidates(options = {}) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const homedir = options.homedir ?? os.homedir();
  const fsModule = options.fsModule ?? fs;
  const candidates = [];

  if (env.JAVA_HOME) candidates.push(env.JAVA_HOME);

  if (platform === "darwin") {
    candidates.push(
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
      "/Applications/Android Studio.app/Contents/jre/Contents/Home",
      path.join(homedir, "Applications/Android Studio.app/Contents/jbr/Contents/Home"),
    );
    try {
      const root = "/Library/Java/JavaVirtualMachines";
      for (const name of fsModule.readdirSync(root).sort().reverse()) {
        candidates.push(path.join(root, name, "Contents/Home"));
      }
    } catch {}
  } else if (platform === "win32") {
    candidates.push(
      path.join(env.LOCALAPPDATA || "", "Programs", "Android Studio", "jbr"),
      path.join(env.ProgramFiles || "", "Android", "Android Studio", "jbr"),
      path.join(env["ProgramFiles(x86)"] || "", "Android", "Android Studio", "jbr"),
    );
  } else {
    candidates.push(
      path.join(homedir, "android-studio", "jbr"),
      "/opt/android-studio/jbr",
      "/usr/local/android-studio/jbr",
    );
  }

  if (Array.isArray(options.extraCandidates)) {
    candidates.push(...options.extraCandidates);
  }
  return [...new Set(candidates.filter(Boolean))];
}

function guessJavaHome(options = {}) {
  const fsModule = options.fsModule ?? fs;
  const platform = options.platform ?? process.platform;
  for (const candidate of javaHomeCandidates(options)) {
    if (!validJavaHome(candidate, { fsModule, platform })) continue;
    try {
      return fsModule.realpathSync(candidate);
    } catch {
      return path.resolve(candidate);
    }
  }
  return undefined;
}

function javaEnvironment(options = {}) {
  const javaHome = guessJavaHome(options);
  return javaHome ? { JAVA_HOME: javaHome } : {};
}

module.exports = {
  guessJavaHome,
  javaBinary,
  javaEnvironment,
  javaHomeCandidates,
  validJavaHome,
};
