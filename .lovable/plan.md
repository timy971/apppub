# Cockpit projet — fondation extensible

## Vision

`/projects/$id` n'est pas une page d'édition : c'est le **cockpit** du projet. Toutes les fonctionnalités futures (Play/App Store, Fastlane, CI, Analytics, iOS…) viendront s'y greffer sans refonte.

## Audit — réutilisation

- `ProjectsService.update()` gère déjà les patches partiels — pas de nouveau service d'écriture.
- `HistoryService.forProject(id)` → source unique du dernier build / dernière publication.
- `BackupService.list(id)` → dernière sauvegarde.
- `DiagnosticService.run(project)` + `HealthScoreService` → réutilisés tels quels dans l'onglet Vue d'ensemble.
- `AppStore` / `useActiveProject` / `bridge().shell` : inchangés.
- Le `BuildService` **n'écrit pas** dans `Project` — la source de vérité reste `HistoryService` (aucune duplication).

## Modèle `Project` — extensions (toutes optionnelles, backward-compatible)

```ts
// Configuration uniquement — jamais d'historique d'exécution
description?: string;
packageName?: string;
lifecycle?: "development" | "published" | "archived";
favorite?: boolean;

publishing?: {
  android?: {
    applicationId?: string;
    keystorePath?: string;      // migre keystorePath racine (compat conservée)
    keystoreAlias?: string;
    defaultTrack?: "internal" | "alpha" | "beta" | "production";
    primaryLanguage?: string;   // ex. "fr-FR"
  };
  ios?: {
    bundleId?: string;
    teamId?: string;
    primaryLanguage?: string;
  };
};

notes?: string;
```

`keystorePath` racine reste lu (compat). Nouvelles écritures vont dans `publishing.android.keystorePath`. Un helper `getAndroidConfig(project)` masque la migration progressive.

## Statut — moteur à règles modulaire

```
src/core/projects/status/
  types.ts         → ProjectStatus, ProjectStatusLevel, ProjectRule, RuleContext
  engine.ts        → runRules(project, ctx): ProjectStatus  (agrège + trie + réduit)
  rules/
    identity.ts    → nom, chemin existant, package.json
    version.ts     → version lisible, version.json
    git.ts         → repo Git renseigné
    android.ts     → keystore, applicationId, gradle wrapper
    ios.ts         → bundleId (dormant tant qu'iOS non détecté)
    build.ts       → dépendances, capacitor
  index.ts         → ProjectStatusService.evaluate(project) — enregistre les rules
```

`ProjectRule` :
```ts
interface ProjectRule {
  id: string;
  domain: "identity" | "git" | "android" | "ios" | "build" | "publishing" | "version";
  evaluate(ctx: RuleContext): RuleOutcome | null; // null = non applicable
}
type RuleOutcome = { severity: "info" | "warn" | "error"; message: string; hint?: string };
```

Ajouter Play Console / Fastlane = créer un fichier dans `rules/` et l'enregistrer dans `index.ts`. Zéro modification du moteur.

## Route `/projects/$id` — cockpit

**Layout** : header sticky (icône, nom, badge lifecycle, badge statut santé, actions rapides : Ouvrir dossier, Ouvrir repo, Définir actif, ⋯) + navigation par onglets internes (état local, pas d'URL nested pour l'instant — extension future via routes enfants sans casse) :

1. **Vue d'ensemble** (par défaut) — le vrai cockpit :
   - `HealthScoreCard` (réutilisé)
   - Dernière version / dernier build / dernière publication (via `HistoryService.forProject`)
   - Dernière sauvegarde (via `BackupService.list`)
   - Checklist (via `ChecklistService` existant si dispo, sinon dérivée du statut)
   - Actions rapides → `/version`, `/build`, `/publish`
2. **Identité** — nom, icône (emoji picker simple), description, chemin, repo Git, lifecycle, favori.
3. **Configuration** — packageName, version actuelle (readonly, source `version.json`), build actuel (readonly).
4. **Publication** — sections dépliables par plateforme. Android d'abord (rempli), iOS visible mais marqué "Bientôt disponible" au niveau des champs (pas un placeholder — la structure existe réellement, la plateforme est simplement non prioritaire). Champs Android : applicationId, keystorePath (+ parcourir), alias, track, langue.
5. **Historique** — timeline `HistoryService.forProject`.
6. **Notes** — textarea auto-save.

Édition **inline** partout, sauvegarde optimiste via `ProjectsService.update`, toast discret.

## Liste `/projects` — refonte

Cartes denses : icône, nom, package, v•build, badge statut avec tooltip (raisons), badge lifecycle, indicateur favori. Menu ⋯ : Ouvrir dossier, Ouvrir repo, Définir actif, Éditer (→ cockpit), Supprimer. Recherche live. Clic carte → cockpit.

## Fichiers créés / modifiés

**Créés** :
- `src/core/projects/status/types.ts`
- `src/core/projects/status/engine.ts`
- `src/core/projects/status/rules/{identity,version,git,android,ios,build}.ts`
- `src/core/projects/status/index.ts`
- `src/core/projects/android-config.ts` (helper migration keystore)
- `src/components/project-status-badge.tsx`
- `src/components/project-lifecycle-badge.tsx`
- `src/routes/projects.$id.tsx`

**Modifiés** :
- `src/core/types.ts` — ajouts optionnels (Project).
- `src/routes/projects.tsx` — refonte liste (menu contextuel, statuts, navigation).
- `src/components/project-switcher.tsx` — 1 ligne : rendre l'entrée cliquable navigue aussi vers le cockpit (optionnel, non-cassant).

**Non modifiés** : `AppStore`, `ProjectsService`, `HistoryService`, `BackupService`, `BuildService`, bridge, routes `/build /publish /version /diagnostic /history /settings`.

## Contraintes respectées

- Aucun `lastBuild` sur `Project` — tout vient de `HistoryService`.
- Multi-plateforme via `publishing.{android,ios}` — extensible.
- Moteur de règles modulaire — un fichier par domaine.
- Cycle de vie `lifecycle` + `favorite` posés dans le modèle, exposés dans Identité, exploitables plus tard par filtres/dashboard.
- Aucun placeholder, aucun TODO, aucune donnée factice.
- Compat totale : anciens projets sans nouveaux champs restent valides ; lecture `keystorePath` racine préservée.

## Vérification finale

`tsgo` + `bun run build` — corriger tout warning TS/ESLint avant livraison. Rapport détaillé fourni en fin d'implémentation.
