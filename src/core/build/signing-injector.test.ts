import { describe, expect, it } from "vitest";
import { SigningInjector } from "./signing-injector";

describe("SigningInjector.inspect", () => {
  it("identifie l'ancienne signature et l'affectation AppPublisher finale", () => {
    const content = `
      android {
        signingConfigs {
          release { storeFile file("cranioscan-release-key.keystore") }
        }
        buildTypes { release { signingConfig signingConfigs.release } }
      }
      // >>> AppPublisher managed signing config — do not edit
      android {
        signingConfigs { appPublisherRelease { storeFile file(APP_KEYSTORE_FILE) } }
        buildTypes { release { signingConfig signingConfigs.appPublisherRelease } }
      }
      // <<< AppPublisher managed signing config
    `;

    const result = SigningInjector.inspect(content);
    expect(result.legacyStoreFiles).toEqual(['"cranioscan-release-key.keystore"']);
    expect(result.releaseAssignments).toEqual(["release", "appPublisherRelease"]);
    expect(result.releaseUsesAppPublisher).toBe(true);
    expect(result.hasAppPublisherRelease).toBe(true);
  });

  it("détecte une réaffectation différée dangereuse", () => {
    const result = SigningInjector.inspect(`
      project.afterEvaluate {
        android.buildTypes.release.signingConfig signingConfigs.release
      }
    `);
    expect(result.hasDeferredSigningOverride).toBe(true);
  });
});