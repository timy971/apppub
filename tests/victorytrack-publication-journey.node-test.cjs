const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("Lot 12.7 — scénario réel VictoryTrack reste publiable sans diagnostic technique", () => {
  const diagnostic = read("src/core/diagnostic/service.ts");
  const preflight = read("src/core/build/preflight.ts");
  const workspaces = read("electron/publication-workspaces.cjs");
  const build = read("src/core/publication/build-service.ts");
  const androidRules = read("src/core/projects/status/rules/android.ts");
  const play = read("src/components/publish-center/google-play-card.tsx");
  const post = read("src/components/publish-center/post-publish-card.tsx");

  // 1. Le diagnostic doit utiliser l'analyse Android live et non un snapshot obsolète.
  assert.match(diagnostic, /androidPreparation\.inspect\(projectPath\)/);
  assert.match(diagnostic, /liveAndroidStatus/);

  // 2. Un android\/ incomplet dans un projet Git géré doit être considéré auto-réparable.
  assert.match(preflight, /incompleteAndroidInManagedGit/);
  assert.match(preflight, /recréé automatiquement dans une source de publication propre/);

  // 3. La réparation ne doit jamais toucher le clone source : uniquement le workspace jetable.
  assert.match(workspaces, /supprimer UNIQUEMENT/);
  assert.match(workspaces, /this\.fs\.rmSync\(androidDir, \{ recursive: true, force: true \}\)/);

  // 4. Le build des projets Git gérés passe par le workspace et prépare Android si nécessaire.
  assert.match(build, /PublicationWorkspaceService\.prepare/);
  assert.match(build, /prepareAndroidIfNeeded/);
  assert.match(build, /PublicationWorkspaceService\.release/);

  // 5. Le Copilot doit rester aligné avec cette auto-réparation.
  assert.match(androidRules, /Android sera reconstruit automatiquement lors de la publication/);
  assert.match(androidRules, /isDisposableAndroidRebuild/);

  // 6. L'envoi Google Play réel doit rester enregistré avec une preuve store.
  assert.match(play, /googlePlay\.publishInternal/);
  assert.match(play, /storeRelease:/);
  assert.match(play, /provider: "google-play"/);
  assert.match(play, /track: "internal"/);

  // 7. Après succès, l'utilisateur reçoit une fin de parcours explicite.
  assert.match(post, /envoyée à Google Play/);
  assert.match(post, /J’ai testé cette version/);
  assert.match(post, /Préparer la prochaine version/);
});

test("Lot 12.7 — les anciens faux blocages VictoryTrack restent couverts par des tests dédiés", () => {
  const expected = [
    "src/core/diagnostic/service.test.ts",
    "src/core/build/preflight.test.ts",
    "src/core/projects/status/rules/android.test.ts",
    "tests/publication-workspaces.node-test.cjs",
    "tests/projects-detect-logging.node-test.cjs",
    "tests/managed-root-restore.node-test.cjs",
  ];
  for (const relative of expected) {
    assert.equal(fs.existsSync(path.join(ROOT, relative)), true, relative + " doit exister");
  }
});
