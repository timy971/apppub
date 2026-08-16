const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("le vocabulaire principal est centralisé et humain hors mode expert", () => {
  const terms = read("src/core/i18n/fr.ts");
  for (const key of [
    "application",
    "androidFile",
    "version",
    "internalNumber",
    "preparation",
    "publication",
  ]) {
    assert.match(terms, new RegExp(`${key}: \\{`));
  }
  assert.match(terms, /label: "Fichier Android"/);
  assert.match(terms, /technical: "Bundle Android \(\.aab\)"/);
  assert.match(terms, /label: "Numéro interne"/);
  assert.match(terms, /technical: "versionCode \/ build"/);
});

test("les trois modes annoncent clairement ce qu’ils affichent sans changer les données", () => {
  const terms = read("src/core/i18n/fr.ts");
  const settings = read("src/routes/settings.tsx");
  const badge = read("src/components/mode-badge.tsx");
  assert.match(terms, /discovery:[\s\S]*Une seule action claire à la fois/);
  assert.match(terms, /assistant:[\s\S]*vérifications, les conseils et les actions guidées/);
  assert.match(terms, /expert:[\s\S]*chemins, commandes, journaux/);
  assert.match(settings, /Le mode ne change jamais vos données ni le\s+résultat des opérations/);
  assert.match(badge, /aria-pressed=\{settings\.mode === m\.value\}/);
});

test("le mode Découverte réduit les écrans aux décisions essentielles", () => {
  const build = read("src/components/build-center/build-center.tsx");
  const preflight = read("src/components/build-center/preflight-card.tsx");
  const publish = read("src/components/publish-center/publish-center.tsx");
  const diagnostic = read("src/routes/diagnostic.tsx");
  assert.match(build, /<AssistantOrAbove>[\s\S]*<SidePanel/);
  assert.match(build, /<ExpertOnly>[\s\S]*<LogConsole/);
  assert.match(preflight, /mode === "discovery"[\s\S]*check\.status !== "success"/);
  assert.match(publish, /<AssistantOrAbove>[\s\S]*<ChecklistCard/);
  assert.match(publish, /<ExpertOnly>[\s\S]*<StoreTargetsCard/);
  assert.match(diagnostic, /settings\.mode !== "discovery" \|\| c\.status !== "ok"/);
});

test("le mode Expert conserve les chemins, commandes, rapports et contrôles Android", () => {
  const result = read("src/components/build-center/result-card.tsx");
  const project = read("src/routes/projects_.$id.tsx");
  const expert = read("src/components/expert-details.tsx");
  assert.match(result, /<ExpertOnly>[\s\S]*Contrôle de l'AAB/);
  assert.match(result, /Copier le chemin/);
  assert.match(result, /Ouvrir le rapport/);
  assert.match(project, /<ExpertOnly>[\s\S]*Commande de build personnalisée/);
  assert.match(expert, /<ExpertOnly>/);
});

test("les actions courantes parlent de fichier Android et de publication", () => {
  const build = read("src/components/build-center/build-center.tsx");
  const publish = read("src/components/publish-center/publish-center.tsx");
  const shared = read("src/components/publish-center/shared.ts");
  assert.match(build, /Fichier Android prêt pour Google Play/);
  assert.match(publish, /Publication préparée/);
  assert.match(shared, /catOf\("build", "Fichier Android"/);
  assert.doesNotMatch(publish, /toast\.success\("Release/);
});
