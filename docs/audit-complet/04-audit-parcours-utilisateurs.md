# 04 — Parcours utilisateurs (A → J)

Méthode : chaque parcours est décrit tel qu'il est **codé**, avec le premier point de rupture. Les parcours exercés dans le navigateur (bridge mocké) sont marqués `PART` : l'UI est prouvée, le comportement natif non.

## Parcours A — Premier lancement

`src/routes/setup.tsx` → wizard 4 étapes (accueil, prénom, dossier de projets, récapitulatif).

| Étape | État | Rupture |
| --- | --- | --- |
| Accueil, bouton « Commencer » | OK | — |
| Saisie du prénom | OK après correctif (focus différé via `requestAnimationFrame`) | Historique : gel complet de l'app (corrigé) |
| Choix du dossier | `NV` — dépend de `projects:chooseFolder` (dialog natif) | Aucun repli si l'utilisateur annule le dialog |
| Récapitulatif | OK | **Aucun bouton retour** — l'utilisateur ne peut pas corriger son prénom |

**Constat UX-A-001 (P1)** — Wizard sans navigation arrière. Viole le principe 4 (réversibilité).

## Parcours B — Importer un projet local

`projects:chooseFolder` → `projects:detect` → `ProjectsService`. Détection : `hasAndroid`, `hasIos`, `hasCapacitorConfig`, `technicalName` (lu depuis `package.json`, jamais écrit — conforme à la consigne).

Rupture : si le dossier n'est pas un projet Node, la détection retourne un projet dégradé sans dire clairement *pourquoi* il l'est. `PART`.

## Parcours C — Cloner un projet Git

`git:check` → `git:inspectRemote` → `git:clone` (`electron/git-projects.cjs`, 465 lignes, confiné au dossier de projets géré).

**Vérifié `EXEC`** : les 4 tests Git de `tests/git-projects.node-test.cjs` **échouent** dans l'environnement d'audit (`not ok 35–38`) faute de binaire/identité Git utilisable en sandbox. La logique est donc **non certifiée**, y compris le test de confinement `refuses Git operations outside the managed projects directory` — c'est-à-dire précisément le test de sécurité.

**Constat UX-C-001 (P0)** — Le confinement Git n'est prouvé par aucun test qui passe. À rejouer sur une machine avec Git configuré avant toute distribution.

## Parcours D — Configurer l'identité du projet

Cockpit `src/routes/projects_.$id.tsx`, onglet Identité. Nom d'affichage éditable, nom technique lecture seule, `applicationId`, version. Édition inline + `CockpitNavProvider` (scroll + focus via `data-cockpit-field`).

État : **OK**. C'est le parcours le plus abouti du produit.

## Parcours E — Créer le dossier Android

`src/core/operations/android-create.ts` → `npm install @capacitor/cli @capacitor/android @capacitor/core` puis `npx cap add android`, sous allowlist (`isPackageManagerWorkflow`).

Rupture : l'allowlist n'autorise que `install` / `run build` / `add <les 3 paquets>`. Un projet utilisant un autre gestionnaire ou une version épinglée sort de l'allowlist et l'opération est refusée sans explication actionnable. `CODE`.

## Parcours F — Créer ou importer un keystore

`src/features/android-signing/**`, IPC `signing:keystoreCreate`, `signing:scan`, `signing:validateStored`, `signing:resolveKeystore`.

- macOS : mot de passe dans le trousseau, transmis par `stdin` (jamais `argv`). **OK, robuste.**
- Windows / Linux : `secrets:supported` répond faux → **aucun stockage** → aucun build signé possible.

**Constat UX-F-001 (P0)** — Sur Windows, le parcours s'arrête ici. Voir [07](07-audit-electron-securite.md) V-03.

Le parseur `keystore-inspector.ts` gère les sorties `keytool` françaises (accents absents, `Valide du` sans deux-points, SHA-256 espacé) et est couvert par tests.

## Parcours G — Lier le profil de signature au projet

`getAndroidConfig` expose `signingProfileId` ; le cockpit affiche l'état lié / non lié et un accès direct à `/signing`.

État : **OK** après correctifs. Reste un aller-retour entre deux écrans pour une opération unique (friction, P3).

## Parcours H — Lancer un build Android signé

`preflight` → `gradle:ensureExecutable` → `gradle:ensureSigningPatch` → `signing:prepareBuild` → `exec:run gradlew bundleRelease` → `signing:verifyAab`.

Succès affiché **seulement si** code de retour 0 **et** AAB présent **et** `jarsigner` valide. C'est la bonne règle.

Rupture : `NV`. Aucun build réel n'a pu être exécuté (pas de JDK Android, pas de SDK, pas de projet Capacitor réel). Le parcours le plus critique du produit reste **non prouvé**.

## Parcours I — Préparer la publication

`src/components/publish-center/**` : checklist multi-catégories, score, notes de version formatées, vérification d'artefact, historique, carte de passation.

Rupture : la « préparation » se termine par un enregistrement local et l'ouverture du navigateur vers la Play Console. **Aucun upload.** L'utilisateur non technique doit alors faire seul ce qu'il venait déléguer.

## Parcours J — Publier une mise à jour (2ᵉ release)

- Incrément de version : `PART` (dépend de `scripts/version.mjs`).
- `versionCode` Android : **jamais incrémenté** → Play refusera le second AAB.

**Constat UX-J-001 (P0)** — Le parcours « publier régulièrement », explicitement dans la définition du succès, est cassé au deuxième passage.

## Synthèse des parcours

| Parcours | Verdict |
| --- | --- |
| A Premier lancement | OK, sans retour arrière (P1) |
| B Import local | OK dégradé |
| C Clone Git | **Non certifié — tests rouges (P0)** |
| D Identité projet | **OK** |
| E Créer android/ | OK sous conditions d'allowlist |
| F Keystore | OK macOS / **cassé Windows (P0)** |
| G Lien signature | OK |
| H Build signé | **Non prouvé (P0)** |
| I Préparation publication | OK, s'arrête avant la publication |
| J Release suivante | **Cassé — versionCode (P0)** |
