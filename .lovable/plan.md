## Phase UX 1.0 — AppPublisher devient un véritable assistant

**Philosophie révisée** : AppPublisher n'est plus un ensemble d'écrans techniques agrémentés d'aides. C'est un assistant qui prend l'utilisateur par la main du premier lancement jusqu'à la première publication. Le Cockpit devient la vue avancée ; le Setup Assistant devient la vue normale.

Aucun nouveau service métier. Aucune duplication. Tous les nouveaux composants lisent les services existants (`ProjectStatusService`, `CopilotService`, `HistoryService`, `BackupService`, `ProjectsService`).

### Audit préalable — redondances à supprimer

Avant tout code, une passe de suppression :

| Information | Sources actuelles | Source unique retenue |
|---|---|---|
| Prochaine action | `NextStepCard` (dashboard) + `NextActionCard` (cockpit) + `CopilotHero` + `PublishCopilotStrip` | `CopilotService.plan().nextAction` — un seul composant `<NextAction />` réutilisé partout, jamais deux visibles simultanément |
| Score / santé | `HealthScoreCard`, `GlobalHealthCard`, `HealthCard`, `ValidationSummaryCard` | `ProjectStatusService.evaluate()` — un composant `<HealthBadge />` (compact) + `<HealthPanel />` (détaillé) |
| Timeline | `PlanTimelineCard`, `ActivityTimeline`, `TimelineCard`, `ReleaseHistoryCard` | `HistoryService` — un composant `<Timeline />` avec filtres selon le contexte |
| Configuration Git | Cockpit onglet Identité + Publish checklist + Health card | Setup Assistant (étape unique) → écrit dans `ProjectsService.update`, le Cockpit reflète |
| Configuration Android | Cockpit onglet Android + Publish store targets + Copilot | Setup Assistant étapes Android → même service |
| Configuration iOS | idem | Setup Assistant étapes iOS |

Livrable de cette phase : ces cartes redondantes disparaissent, remplacées par des références au Setup Assistant.

### 1. Setup Assistant — fil conducteur de l'application

Nouveau module `src/components/setup-assistant/` :

```text
setup-assistant/
  assistant-provider.tsx   → contexte global, ouvrable partout via useSetupAssistant()
  assistant-sheet.tsx      → Sheet plein écran, une étape à la fois
  step-registry.ts         → tableau ordonné SetupStep[] (extensible)
  steps/
    identity.tsx           → Nom + description
    folder.tsx             → Dossier du projet (avec "Je ne sais pas" + exemple)
    git.tsx                → Dépôt Git
    android-id.tsx         → Identifiant Android
    android-keystore.tsx   → Signature
    android-language.tsx   → Langue principale
    ios-id.tsx             → Identifiant iOS (dormant tant qu'iOS non détecté)
    version.tsx            → Version initiale
    ready.tsx              → "Projet prêt à construire"
  step.ts                  → type SetupStep { id, domain, isRelevant, isDone, title, why, render }
```

`SetupStep` : chaque étape est un fichier auto-contenu qui lit le projet, décide si elle s'applique, si elle est complète, et rend son propre formulaire (réutilise `EditableField` + `validators.ts`). Le moteur navigue automatiquement à la suivante après validation.

**Extensibilité future** (Google Play, App Store Connect, GitHub, Fastlane, Firebase, Crashlytics, RevenueCat, Analytics) : ajouter un fichier dans `steps/`, l'enregistrer dans `step-registry.ts`. Zéro modification du moteur.

**Comportement** :
- Chaque étape explique **pourquoi** (bloc pédagogique adapté au mode), puis propose le champ, puis avance seule quand c'est valide.
- Bouton "Passer" (facultatif) → l'étape se rappelle plus tard.
- Bouton "Ouvrir dans le Cockpit" → pour les experts qui veulent la vue technique.
- Persistance : rien à sauvegarder côté Assistant — tout passe par `ProjectsService.update` avec `source: "user"`. L'ordre "où j'en suis" est dérivé de `ProjectStatusService` (source de vérité).

**Déclencheurs** :
- Bouton principal du `<NextAction />` du Copilot → ouvre l'Assistant sur la bonne étape.
- Wizard `setup.tsx` : à la fin du premier lancement, ouvre directement l'Assistant sur l'étape courante.
- Cockpit `HealthPanel` : chaque ligne d'erreur ouvre l'Assistant sur l'étape correspondante (au lieu de scroller vers un champ isolé).
- Dashboard : bouton "Continuer la configuration" tant que `ProjectStatusService` n'est pas vert.

### 2. Dashboard — hiérarchie unique

Réordonnancement radical de `src/routes/index.tsx` :

```text
┌────────────────────────────────────────────────┐
│  Aujourd'hui (bandeau discret : date, projet)   │
├────────────────────────────────────────────────┤
│                                                 │
│  COPILOT — dominant, plein largeur              │
│  ┌──────────────────────────────────────────┐   │
│  │ Prochaine action (gros bouton unique)    │   │
│  │ + 1 phrase de justification              │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
├────────────────────────────────────────────────┤
│  État du projet (HealthPanel compact)           │
├────────────────────────────────────────────────┤
│  Support : Mes projets · Activité récente       │
└────────────────────────────────────────────────┘
```

Suppression sur le Dashboard : `BlockersCard`, `ReadyCard`, `StatsStrip`, `PlanTimelineCard` (leurs infos sont accessibles via l'Assistant ou le Cockpit — pas besoin d'un doublon en Home).

### 3. Build Center — écran qui rassure

`src/components/build-center/progress-panel.tsx` + nouveau `live-status.tsx` :

- **Compteur vivant** : temps écoulé animé à la seconde + spinner permanent tant qu'une étape est active.
- **Messages qui évoluent** : mapping statique par étape → phrase humaine rotative ("Gradle prépare les dépendances…", "Compilation des ressources Android…", "Optimisation du bundle…"). Rotation toutes les 4 s même si l'étape ne bouge pas.
- **ETA visible** : bloc dédié "Écoulé · Restant · Moyenne" en typographie large.
- **Conseils contextuels** (`build-tips.tsx`) : après 20 s, affichage d'un conseil rotatif ("Premier build ? Gradle télécharge ~200 Mo", "Vous pouvez continuer à utiliser AppPublisher", "Les prochains builds seront plus rapides").
- **Étapes plus détaillées** : `steps-timeline.tsx` affiche sous-étapes actives (extraites des logs déjà présents — pas de nouveau parseur, juste un filtre d'affichage).
- **Jamais figé** : animation pulse même sur étape "silencieuse".

Aucun changement dans `OperationRunner` / `android-build.ts` / `estimator.ts`.

### 4. Publish Center — écran qui explique

Refonte texte, structure inchangée :

- **Bandeau introduction persistant** : "Une release, c'est la version que vos utilisateurs verront. AppPublisher vous aide à préparer chaque élément demandé par les stores. La publication automatique arrivera prochainement."
- Chaque section de la checklist reçoit un **`why`** court (1 phrase) : "Pourquoi un keystore ? Google Play exige une signature unique pour vérifier que les mises à jour viennent de vous."
- Distinction visuelle **Requis / Recommandé / Facultatif** (issue de `ProjectRule.severity`).
- Bandeau "Bientôt automatisé" sur les sections qui seront un jour couvertes par Play Console / App Store Connect (flag `PUBLISH_AUTOMATION_ENABLED` dans `src/core/app-info.ts`).
- Suppression de `ValidationSummaryCard` (doublon de la checklist) et remplacement par un simple résumé "Prêt à publier · X éléments restants".

### 5. Modes — vraie personnalité

Refonte de `ModeGate` non nécessaire (déjà en place). Application systématique :

**Découverte** :
- Sur chaque étape du Setup Assistant : bloc "Pourquoi ?" toujours visible, ton pédagogique, boutons plus gros (`size="lg"`), exemples inline ("ex. `com.monentreprise.monapp`").
- Vocabulaire : "Dossier du projet", "Dépôt Git", "Identifiant Android".
- Sidebar : "Console" masquée, "Journal" affiché.
- Copilot : formulations "Commençons par…", "Ensuite nous allons…".

**Assistant** (défaut) :
- Bloc "Pourquoi ?" repliable.
- Vocabulaire humain, mais sans exemples systématiques.
- Sidebar complète sauf "Console".
- Ton neutre, direct.

**Expert** :
- Chaque champ affiche à côté sa **commande shell équivalente** (`git remote add origin …`), le **chemin réel** du fichier concerné, la **version détectée** (Node, Gradle, Java).
- Sidebar complète, "Console" visible, logs bruts par défaut.
- Setup Assistant : mode "table dense" — toutes les étapes visibles simultanément avec édition inline.
- Header projet : Application ID, package name, chemin absolu, dernière commande exécutée.
- Bouton "Copier" (chemins, commandes, IDs) systématique.

Deux nouveaux composants légers :
- `<ExpertCommand cmd="…" />` : ligne mono + bouton copier (Expert uniquement).
- `<WhyBlock title="…" mode="collapsible|always|hidden" />` : gère automatiquement l'affichage selon le mode.

### 6. Wizard premier lancement

`src/routes/setup.tsx` reçoit :
- Étape "Dossier du projet" : titre humanisé, sous-texte pédagogique, boutons "Je ne sais pas" (panneau explicatif) et "Ouvrir un exemple" (via `bridge().openExampleProject()` s'il existe, sinon guide texte).
- À la fin : redirection vers le Dashboard + ouverture automatique du Setup Assistant sur la première étape manquante.

### 7. Vocabulaire — passe globale

Fichier unique `src/core/i18n/fr.ts` (constantes, pas de runtime i18n). Toutes les chaînes UI reformulées :

| Ancien | Nouveau (Découverte/Assistant) | Expert (inchangé) |
|---|---|---|
| Chemin du projet | Dossier du projet | Chemin du projet |
| Repository | Dépôt Git | Repository |
| Application ID | Identifiant Android | applicationId |
| Bundle ID | Identifiant iOS | bundleId |
| Artifact | Fichier généré (.aab) | Artifact |
| Working directory | Dossier utilisé | Working directory |

Le mode Expert lit une variante technique quand elle existe.

### 8. Hiérarchie diagnostics (sidebar)

- "Santé du projet" (état actuel : prêt / à compléter)
- "Support" (résoudre un problème)
- "Journal" (historique)
- "Console" (Expert uniquement, via `ExpertOnly`)

Libellés + sous-titres alignés dans `src/components/app-sidebar.tsx`.

### 9. Contraintes respectées

- **Aucun nouveau service métier** — Setup Assistant lit `ProjectStatusService` et écrit via `ProjectsService.update`.
- **Aucune duplication** — audit du §0 appliqué ; les cartes redondantes sont supprimées, pas dupliquées.
- **Aucune logique métier dans les composants** — chaque étape du Setup délègue à un validateur existant.
- **Aucun TODO, aucun placeholder, aucun faux workflow.**
- Extensibilité : ajouter Google Play = 1 fichier `steps/google-play.tsx` + 1 ligne dans `step-registry.ts`.

### 10. Validation finale

```text
bunx tsgo --noEmit
bun run build
```

**Rapport de parcours utilisateur** simulant un débutant :
1. Premier lancement → Wizard → Dashboard.
2. Copilot propose "Continuer la configuration" → Setup Assistant s'ouvre sur la première étape manquante.
3. L'utilisateur remplit chaque étape (dossier, Git, identifiant Android, keystore, langue, version) — chaque étape explique pourquoi.
4. "Projet prêt à construire" → bouton "Lancer un build" → Build Center rassurant.
5. Build terminé → Copilot propose "Préparer une release" → Publish Center explicatif.

Pour chaque étape : friction observée, correction apportée, résultat. Aucune impasse. Aucun besoin de quitter AppPublisher.
