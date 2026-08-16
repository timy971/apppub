const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("le parcours novice couvre les six étapes jusqu'au test interne", () => {
  const sidebar = read("src/components/app-sidebar.tsx");
  const orderedLabels = [
    "1. Votre application",
    "2. Vérifier l'application",
    "3. Préparer la version",
    "4. Protéger l'application",
    "5. Créer le fichier Android",
    "6. Publier sur Google Play",
  ];
  let previous = -1;
  for (const label of orderedLabels) {
    const position = sidebar.indexOf(label);
    assert.ok(position > previous, `${label} doit rester dans le parcours principal`);
    previous = position;
  }

  const result = read("src/components/build-center/result-card.tsx");
  const publish = read("src/components/publish-center/google-play-card.tsx");
  assert.match(result, /Continuer vers la publication/);
  assert.match(publish, /Test interne/);
  assert.match(publish, /Envoyer aux testeurs internes/);
});

test("la deuxième publication impose un numéro interne supérieur", () => {
  const card = read("src/components/publish-center/google-play-card.tsx");
  const version = read("src/routes/version.tsx");
  assert.match(card, /googlePlayLastKnownBuild === project\.currentBuild/);
  assert.match(card, /Augmenter le numéro interne/);
  assert.match(card, /version-already-used/);
  assert.match(version, /Numéro interne/);
});

test("les écrans d'échec critiques proposent une reprise et une demande d'aide", () => {
  for (const relative of [
    "src/routes/diagnostic.tsx",
    "src/components/publish-center/publish-center.tsx",
    "src/components/build-center/error-panel.tsx",
  ]) {
    const source = read(relative);
    assert.match(source, /Réessayer/);
    assert.match(source, /<HelpRequestButton/);
  }
});

test("toutes les copies métier passent par le pont système compatible Electron", () => {
  const uiRoots = ["src/components", "src/routes"];
  const offenders = [];

  const visit = (relativeDirectory) => {
    for (const entry of fs.readdirSync(path.join(ROOT, relativeDirectory), { withFileTypes: true })) {
      const relative = path.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const source = read(relative);
        if (/navigator\.clipboard\.writeText/.test(source)) offenders.push(relative);
      }
    }
  };

  uiRoots.forEach(visit);
  assert.deepEqual(offenders, [], `copies directes non compatibles : ${offenders.join(", ")}`);

  for (const relative of [
    "src/components/expert-details.tsx",
    "src/components/project-cockpit/resources-card.tsx",
    "src/components/publish-center/release-notes.tsx",
    "src/components/publish-center/handoff-card.tsx",
    "src/routes/logs.tsx",
  ]) {
    assert.match(read(relative), /bridge\(\)\.system\.copyText/);
  }
});

test("le mode expert conserve les outils techniques sans les imposer au novice", () => {
  const details = read("src/components/expert-details.tsx");
  const build = read("src/components/build-center/build-center.tsx");
  const journal = read("src/routes/journal.tsx");
  assert.match(details, /<ExpertOnly>/);
  assert.match(build, /<ExpertOnly>[\s\S]*<LogConsole/);
  assert.match(journal, /isExpert &&/);
  assert.match(journal, /Détails techniques/);
});

test("le navigateur reste une démonstration sans faux succès métier", () => {
  const settings = read("src/routes/settings.tsx");
  const webBridge = read("src/core/bridge/web.ts");
  assert.match(settings, /lecture seule|démonstration/i);
  assert.match(webBridge, /runtime: "web"/);
  assert.doesNotMatch(webBridge, /runtime: "electron"/);
});
