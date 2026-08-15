const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("la navigation suit le parcours utilisateur dans le bon ordre", () => {
  const sidebar = read("src/components/app-sidebar.tsx");
  const labels = [
    "1. Votre application",
    "2. Vérifier l'application",
    "3. Préparer la version",
    "4. Protéger l'application",
    "5. Créer le fichier Android",
    "6. Publier sur Google Play",
  ];
  let previous = -1;
  for (const label of labels) {
    const index = sidebar.indexOf(label);
    assert.ok(index > previous, `${label} doit apparaître dans l'ordre du parcours`);
    previous = index;
  }
  assert.doesNotMatch(sidebar, /Build Center|Publish Center|Signatures Android/);
});

test("le parcours global annonce six étapes et la position courante", () => {
  const journey = read("src/components/publication-journey.tsx");
  assert.match(journey, /PUBLICATION_STEPS/);
  assert.match(journey, /number: 6/);
  assert.match(journey, /Étape \{current\.number\} sur/);
  assert.match(journey, /aria-current=\{active \? "step"/);
  assert.match(journey, /Étapes pour publier votre application/);
});

test("le premier écran explique la promesse en moins d'une minute", () => {
  const setup = read("src/routes/setup.tsx");
  assert.match(setup, /Publier une application devient un parcours guidé/);
  assert.match(setup, /1\. Choisir/);
  assert.match(setup, /2\. Vérifier/);
  assert.match(setup, /3\. Publier/);
  assert.match(setup, /Environ une minute/);
  assert.match(setup, /Rien n'est envoyé sans votre confirmation/);
});

test("l'onboarding accepte un lien GitHub ou Lovable sans demander de connaître Git", () => {
  const setup = read("src/routes/setup.tsx");
  assert.match(setup, /Sur GitHub ou Lovable/);
  assert.match(setup, /Lien de votre application/);
  assert.match(setup, /Gardez le choix recommandé si vous ne savez pas lequel prendre/);
  assert.match(setup, /Dans un dossier sur ce Mac/);
  assert.doesNotMatch(setup, /package\.json/);
});

test("chaque étape principale distingue l'automatique de l'action utilisateur", () => {
  const purpose = read("src/components/step-purpose.tsx");
  assert.match(purpose, /AppPublisher s'occupe de/);
  assert.match(purpose, /Votre seule action/);
  assert.match(purpose, /À la fin/);
  for (const route of ["diagnostic", "version", "signing", "build", "publish"]) {
    assert.match(read(`src/routes/${route}.tsx`), /<StepPurpose/);
  }
});

test("l'assistance regroupe vérification, historique et console experte", () => {
  const support = read("src/routes/journal.tsx");
  assert.match(support, /Aide et historique/);
  assert.match(support, /Vérifier mon application/);
  assert.match(support, /Voir les opérations passées/);
  assert.match(support, /isExpert &&/);
  assert.match(support, /Console technique/);
  assert.match(support, /ne contiennent aucun mot de passe/);
});

test("la structure globale est accessible au clavier et en français", () => {
  const root = read("src/routes/__root.tsx");
  const sidebarUi = read("src/components/ui/sidebar.tsx");
  assert.match(root, /href="#contenu-principal"/);
  assert.match(root, /id="contenu-principal"/);
  assert.match(root, /Aller au contenu principal/);
  assert.match(sidebarUi, /Afficher ou masquer la navigation/);
  assert.doesNotMatch(sidebarUi, />Toggle Sidebar</);
});

test("les titres des étapes n'exposent plus les noms techniques historiques", () => {
  assert.doesNotMatch(read("src/routes/build.tsx"), /title="Build Center"/);
  assert.doesNotMatch(read("src/routes/publish.tsx"), /title="Publish Center"/);
  assert.doesNotMatch(read("src/routes/signing.tsx"), /title="Signatures Android"/);
});
