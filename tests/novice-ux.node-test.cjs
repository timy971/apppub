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
  assert.match(setup, /dépôt GitHub connecté à votre projet Lovable/);
  assert.match(setup, /Le lien de\s+partage Lovable ne fonctionne pas ici/);
  assert.doesNotMatch(setup, /package\.json/);
});

test("la future publication Apple reste visible sans faux bouton actif", () => {
  const sidebar = read("src/components/app-sidebar.tsx");
  const publish = read("src/routes/publish.tsx");
  const apple = read("src/routes/apple.tsx");
  assert.match(sidebar, /Publication Android pas à pas/);
  assert.match(sidebar, /iPhone et iPad/);
  assert.match(sidebar, /En pause/);
  assert.match(sidebar, /url: "\/apple"/);
  assert.doesNotMatch(publish, /iPhone et iPad|Apple Developer|App Store Connect/);
  assert.match(apple, /Publication iPhone et iPad/);
  assert.match(apple, /compte Apple Developer/);
  assert.match(apple, /Vous n'avez rien à configurer maintenant/);
  assert.doesNotMatch(read("src/components/publish-center/store-targets.tsx"), /title="iOS"/);
  assert.doesNotMatch(read("src/routes/projects_.$id.tsx"), /Team ID|Scheme Xcode|Fastlane/);
});

test("la préparation locale et l'envoi Google Play sont deux états distincts", () => {
  const types = read("src/core/types.ts");
  const center = read("src/components/publish-center/publish-center.tsx");
  const publishRule = read("src/core/copilot/rules/publish.ts");
  assert.match(types, /"release-prepared"/);
  assert.match(center, /kind: "release-prepared"/);
  assert.match(publishRule, /completedStepId: "publish"/);
  assert.match(publishRule, /storeRelease/);
});

test("les vérifications interrompues proposent toujours de réessayer", () => {
  assert.match(read("src/routes/diagnostic.tsx"), /Vérification interrompue/);
  assert.match(read("src/components/build-center/preflight-card.tsx"), /Réessayez pour continuer/);
  assert.match(read("src/components/publish-center/publish-center.tsx"), /Vérification impossible/);
  assert.match(read("src/components/publish-center/publish-center.tsx"), />\s*Réessayer\s*</);
});

test("la création simple associe automatiquement la signature à l'application active", () => {
  const signing = read("src/routes/signing.tsx");
  assert.match(signing, /Signature associée à l'application/);
  assert.match(signing, /signingProfileId: profileId/);
  assert.match(signing, /Confirmer le mot de passe/);
  assert.doesNotMatch(signing, /<Label>Alias<\/Label>/);
  assert.doesNotMatch(signing, /<Label>Organisation \(O\)<\/Label>/);
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
