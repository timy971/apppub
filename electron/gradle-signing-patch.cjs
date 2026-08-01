const MARKER_BEGIN = "// >>> AppPublisher managed signing config — do not edit";
const MARKER_END = "// <<< AppPublisher managed signing config";

const GRADLE_PATCH = `
${MARKER_BEGIN}
android {
    signingConfigs {
        appPublisherRelease {
            if (project.hasProperty('APP_KEYSTORE_FILE') &&
                project.hasProperty('APP_KEYSTORE_PASSWORD') &&
                project.hasProperty('APP_KEY_ALIAS') &&
                project.hasProperty('APP_KEY_PASSWORD')) {
                storeFile file(APP_KEYSTORE_FILE)
                storePassword APP_KEYSTORE_PASSWORD
                keyAlias APP_KEY_ALIAS
                keyPassword APP_KEY_PASSWORD
            }
        }
    }
    buildTypes {
        release {
            if (project.hasProperty('APP_KEYSTORE_FILE') &&
                project.hasProperty('APP_KEYSTORE_PASSWORD') &&
                project.hasProperty('APP_KEY_ALIAS') &&
                project.hasProperty('APP_KEY_PASSWORD')) {
                signingConfig signingConfigs.appPublisherRelease
            }
        }
    }
}
${MARKER_END}
`;

function count(content, token) {
  return content.split(token).length - 1;
}

function buildPatchedGradle(content) {
  if (typeof content !== "string" || content.length > 2_000_000 || content.includes("\u0000")) {
    return { ok: false, errorCode: "invalid-content" };
  }
  const begins = count(content, MARKER_BEGIN);
  const ends = count(content, MARKER_END);
  if (begins !== ends || begins > 1) {
    return { ok: false, errorCode: "managed-block-corrupt" };
  }
  const markerPattern = new RegExp(
    `${MARKER_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${MARKER_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    "g",
  );
  const withoutManaged = content.replace(markerPattern, "").replace(/\s*$/, "");
  const next = `${withoutManaged}\n${GRADLE_PATCH}\n`;
  return { ok: true, changed: next !== content, content: next };
}

module.exports = { GRADLE_PATCH, MARKER_BEGIN, MARKER_END, buildPatchedGradle };
