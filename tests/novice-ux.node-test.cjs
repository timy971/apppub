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

test("l'accueil concentre l'attention sur une seule prochaine action", () => {
  const dashboard = read("src/routes/index.tsx");
  const focus = read("src/components/dashboard/focus-card.tsx");
  assert.match(dashboard, /<DashboardFocusCard/);
  assert.doesNotMatch(dashboard, /<TodayCard|<NextStepCard|<BlockersCard|<ReadyCard/);
  assert.match(focus, /Application active/);
  assert.match(focus, /Votre prochaine action/);
  assert.match(focus, /Étape \{currentIndex \+ 1\} sur \{plan\.steps\.length\}/);
  assert.match(focus, /<details/);
  assert.match(focus, /Voir l'état détaillé/);
  assert.doesNotMatch(focus, /Score \{plan\.score\}|Temps estimé/);
  assert.match(dashboard, /summaries\.length > 0 &&/);
});

test("les indicateurs secondaires restent repliés hors du mode découverte", () => {
  const dashboard = read("src/routes/index.tsx");
  assert.match(dashboard, /settings\.mode !== "discovery"/);
  assert.match(dashboard, /<details[^>]*className="group rounded-xl/);
  assert.match(dashboard, /Indicateurs et activité/);
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
  const sidebar = read("src/components/app-sidebar.tsx");
  const history = read("src/routes/history.tsx");
  const logs = read("src/routes/logs.tsx");
  assert.match(sidebar, /Activité et aide/);
  assert.match(support, /title="Activité et aide"/);
  assert.match(support, /Résumé/);
  assert.match(support, /Opérations passées/);
  assert.match(support, /isExpert &&/);
  assert.match(support, /Détails techniques/);
  assert.match(support, /Aucun mot de passe n'est inclus/);
  assert.match(history, /redirect\(\{ to: "\/journal", search: \{ view: "history" \} \}\)/);
  assert.match(logs, /redirect\(\{ to: "\/journal", search: \{ view: "technical" \} \}\)/);
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

test("le parcours reprend la dernière étape après un redémarrage", () => {
  const types = read("src/core/types.ts");
  const progress = read("src/core/navigation/journey-progress.ts");
  const journey = read("src/components/publication-journey.tsx");
  const focus = read("src/components/dashboard/focus-card.tsx");
  assert.match(types, /lastJourneyPath\?: PublicationJourneyPath/);
  assert.match(progress, /JourneyProgress/);
  assert.match(journey, /JourneyProgress\.visit\(normalized\)/);
  assert.match(focus, /Reprendre : \{JOURNEY_LABELS\[lastJourneyPath\]\}/);
});

test("une correction ramène à l'étape qui l'a demandée", () => {
  const progress = read("src/core/navigation/journey-progress.ts");
  const continuation = read("src/components/journey-continuation.tsx");
  const preflight = read("src/components/build-center/preflight-card.tsx");
  const publish = read("src/components/publish-center/header.tsx");
  assert.match(progress, /returnToJourneyPath/);
  assert.match(continuation, /Revenir à « \$\{JOURNEY_LABELS\[returnTo\]\} »/);
  assert.match(preflight, /rememberReturnTo\("\/build"\)/);
  assert.match(publish, /rememberReturnTo\("\/publish"\)/);
});

test("la signature se choisit et la suite reste visible dans le même flux", () => {
  const signing = read("src/routes/signing.tsx");
  assert.match(signing, /Utiliser pour \{applicationName\}/);
  assert.match(signing, /selected=\{p\.id === associatedProfileId\}/);
  assert.match(signing, /fallbackTo="\/build"/);
  assert.match(signing, /Signature prête/);
});

test("le changement d'écran place le focus sur un titre explicite", () => {
  const root = read("src/routes/__root.tsx");
  const header = read("src/components/page-header.tsx");
  const setup = read("src/routes/setup.tsx");
  assert.match(root, /RouteFocusManager/);
  assert.match(root, /querySelector<HTMLElement>\("\[data-page-heading\]"\)/);
  assert.match(header, /data-page-heading/);
  assert.match(setup, /data-page-heading/);
});

test("les opérations longues annoncent leur progression et leur résultat", () => {
  const progress = read("src/components/build-center/progress-panel.tsx");
  const workflow = read("src/components/workflow-view.tsx");
  const result = read("src/components/build-center/result-card.tsx");
  const error = read("src/components/build-center/error-panel.tsx");
  assert.match(progress, /aria-live="polite"/);
  assert.match(progress, /aria-valuetext/);
  assert.match(workflow, /role="status"/);
  assert.match(result, /role="status"/);
  assert.match(error, /role="alert"/);
});

test("les champs critiques ont un nom accessible et les filtres sont utilisables au clavier", () => {
  const projects = read("src/routes/projects.tsx");
  const signing = read("src/routes/signing.tsx");
  const releaseNotes = read("src/components/publish-center/release-notes.tsx");
  const logs = read("src/routes/logs.tsx");
  assert.match(projects, /htmlFor="projects-scan-root"/);
  assert.match(projects, /aria-label="Filtrer par cycle de vie"/);
  assert.match(signing, /htmlFor="signature-import-password"/);
  assert.match(releaseNotes, /aria-describedby="release-notes-help release-notes-count"/);
  assert.match(logs, /aria-pressed=\{selectedLevels\.has\(l\)\}/);
  assert.doesNotMatch(logs, /<Badge[^>]*onClick/);
});

test("les chargements et états vides restent compréhensibles", () => {
  const diagnostic = read("src/routes/diagnostic.tsx");
  const publish = read("src/components/publish-center/publish-center.tsx");
  const dashboard = read("src/components/dashboard/focus-card.tsx");
  assert.match(diagnostic, /Vérification en cours/);
  assert.match(diagnostic, /Aucun résultat disponible/);
  assert.match(diagnostic, />\s*Réessayer\s*</);
  assert.match(publish, /Vérification de l'application et du fichier Android en cours/);
  assert.match(dashboard, /Chargement de la prochaine action/);
});

test("Google Play présente un parcours novice en quatre états", () => {
  const journey = read("src/components/publish-center/google-play-journey.tsx");
  const card = read("src/components/publish-center/google-play-card.tsx");
  for (const label of ["À configurer", "Connecté", "Prêt à envoyer", "Envoyé"]) {
    assert.match(journey, new RegExp(label));
  }
  for (const step of [
    "Compte Google",
    "Application Play Console",
    "Fichier Android",
    "Test interne",
    "Mise en ligne publique",
  ]) {
    assert.match(journey, new RegExp(step));
  }
  assert.match(card, /<GooglePlayJourney/);
});

test("la première publication manuelle n'est jamais renvoyée avec le même numéro", () => {
  const types = read("src/core/types.ts");
  const card = read("src/components/publish-center/google-play-card.tsx");
  const guide = read("src/components/publish-center/google-play-setup-guide.tsx");
  assert.match(types, /googlePlayLastKnownBuild\?: number/);
  assert.match(card, /googlePlayLastKnownBuild === project\.currentBuild/);
  assert.match(card, /confirmsFirstManualRelease/);
  assert.match(guide, /mémorisera que ce numéro a déjà été utilisé/);
});

test("les refus Google Play restent visibles avec une action compréhensible", () => {
  const card = read("src/components/publish-center/google-play-card.tsx");
  assert.match(card, /<GooglePlayRecovery/);
  assert.match(card, /Ce qu’il faut faire/);
  assert.match(card, /Augmenter le numéro interne/);
  assert.match(card, /Recréer le fichier Android/);
  assert.match(card, /Ouvrir Play Console/);
  assert.match(card, /Les quatre blocages les plus fréquents/);
  assert.match(card, /Mauvaise clé/);
});

test("le test interne continue vers une vraie checklist de publication publique", () => {
  const card = read("src/components/publish-center/google-play-card.tsx");
  const assistant = read("src/components/publish-center/google-play-launch-assistant.tsx");
  const plan = read("src/core/google-play/launch-plan.ts");
  assert.match(card, /<GooglePlayLaunchAssistant/);
  assert.match(card, /Test interne : étape automatique/);
  assert.match(assistant, /Mise en ligne publique/);
  assert.match(assistant, /Prochaine action/);
  assert.match(assistant, /Dossier envoyé à Google/);
  assert.match(assistant, /Il n’est public qu’après l’acceptation/);
  for (const requirement of [
    "politique de confidentialité",
    "sécurité des données",
    "public cible",
    "questionnaire de classification",
    "tests exigés par Google",
    "version de production",
  ]) {
    assert.match(plan, new RegExp(requirement, "i"));
  }
});

test("les instructions de fichier sont compatibles macOS et Windows", () => {
  const guide = read("src/components/publish-center/google-play-setup-guide.tsx");
  assert.match(guide, /Afficher le fichier dans son dossier/);
  assert.doesNotMatch(guide, /Afficher le fichier dans le Finder/);
});
