const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isAndroidApplicationId,
  resolveStoredAndroidPackage,
} = require("../electron/android-package-identity.cjs");

test("Android identity rejects npm project names", () => {
  assert.equal(isAndroidApplicationId("vite_react_shadcn_ts"), false);
  assert.equal(isAndroidApplicationId("app.cranioscan.android"), true);
});

test("stored Android identity keeps an established Play package immutable", () => {
  assert.equal(
    resolveStoredAndroidPackage({
      packageName: "vite_react_shadcn_ts",
      playStoreAppId: "app.play.immutable",
      detected: { capacitorAppId: "app.old.capacitor" },
      publishing: { android: { applicationId: "app.victorytrack.android" } },
    }),
    "app.play.immutable",
  );
});

test("stored Android identity falls back only to valid package-shaped candidates", () => {
  assert.equal(
    resolveStoredAndroidPackage({
      packageName: "vite_react_shadcn_ts",
      detected: { capacitorAppId: "app.cranioscan.android" },
      publishing: { android: {} },
    }),
    "app.cranioscan.android",
  );
  assert.equal(
    resolveStoredAndroidPackage({
      packageName: "vite_react_shadcn_ts",
      playStoreAppId: "invalid",
      publishing: { android: {} },
    }),
    undefined,
  );
});
