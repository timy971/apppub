# 13 — Backlog priorisé

Priorités : **P0** bloque la distribution — **P1** bloque la commercialisation — **P2** dette structurante — **P3** confort — **P4** cosmétique.

Chaque ligne porte l'identifiant du constat d'origine, sa source et une définition de « terminé » vérifiable.

## P0 — Bloqueurs de distribution

| ID | Action | Source | Terminé quand |
| --- | --- | --- | --- |
| P0-1 | Rendre `npm test` vert : rendre les 4 tests Git déterministes (identité posée dans le test, dépôt source local, zéro réseau) | QA-001, GIT-001 | `npm test` retourne 0 sur machine propre |
| P0-2 | Test d'intégration build Android réel sur macOS : fixture Capacitor committée, keystore généré à la volée, AAB produit et vérifié par `jarsigner` avec l'empreinte attendue | AND-001, QA-003 | Le test échoue si l'AAB n'est pas signé par la bonne clé |
| P0-3 | Écrire `versionCode`/`versionName` dans le projet Android depuis AppPublisher, idempotent, sans dépendre de `scripts/version.mjs` | AND-002 | Deux builds consécutifs produisent deux `versionCode` strictement croissants, vérifié par test |
| P0-4 | Supprimer tout succès simulé silencieux : bandeau permanent non masquable hors Electron, ou refus de charger l'UI | PROD-004, UX-004, REL-001 | Impossible d'obtenir un état « réussi » sans opération réelle |
| P0-5 | Publication Google Play réelle : API v3 `edits`/`bundles.upload`/`tracks.update`/`commit`, compte de service dans le trousseau, piste `internal` uniquement, confirmation explicite | AND-003, PROD-001 | Un AAB atteint la piste interne sans ouvrir de navigateur |
| P0-6 | Corriger `isDev` : conditionner au `app.isPackaged`, pas à la seule variable d'environnement | V-00 ([07](07-audit-electron-securite.md)) | Un paquet signé ignore `APPPUBLISHER_DEV_URL` |
| P0-7 | Windows : soit coffre-fort de mots de passe (DPAPI), soit annonce explicite « macOS uniquement » et blocage du parcours signature avec message clair | V-03, UX-F-001 | Aucun chemin Windows ne mène à un cul-de-sac muet |

## P1 — Bloqueurs de commercialisation

| ID | Action | Source | Terminé quand |
| --- | --- | --- | --- |
| P1-1 | Signature + notarisation macOS, installeur DMG, canal d'auto-update | BUILD-004, REL-002 | Gatekeeper ouvre le paquet sans contournement ; une v+1 s'installe automatiquement |
| P1-2 | Vider le lint : `eslint --fix` puis traiter les 20 avertissements React | QA-002 | `npm run lint` retourne 0 |
| P1-3 | Tests du Copilot (9 règles) et du moteur `ProjectStatus` | QA-004 | Chaque règle a au moins un cas positif et un cas négatif |
| P1-4 | Modéliser les règles Play : `targetSdk` minimum, test fermé 20 testeurs / 14 jours, vérification d'identité, obligation AAB | AND-004, BIZ-001 | Un compte neuf est averti **avant** le build, pas après |
| P1-5 | Étiqueter les 34 champs sans label ; ajouter `aria-live` aux zones de progression de build | A11Y-001, A11Y-002 | Test `axe` vert sur les 14 routes |
| P1-6 | Navigation arrière dans le wizard de premier lancement | UX-A-001 | Chaque étape ≥ 1 a un retour fonctionnel |
| P1-7 | Fusionner `/diagnostic`, `/history`, `/journal`, `/logs` en un écran « Activité » à deux niveaux | UX-001 | La sidebar perd 3 entrées, aucune information perdue |
| P1-8 | Découper `electron/main.cjs` (2 397 lignes, 48 handlers) par domaine | ARCH-001 | Aucun fichier `electron/` > 400 lignes |
| P1-9 | Test d'autonomie du dépôt : chaque fichier exigé par `scripts/pack.cjs` est suivi par `git ls-files` | GIT-003 | Le test échoue si un fichier de `build/` est ignoré |
| P1-10 | Citer le chemin de log dynamiquement (`diag:getLogPath`) partout, docs incluses | OBS-001 | Aucun chemin de log en dur dans le dépôt |

## P2 — Dette structurante

| ID | Action | Source |
| --- | --- | --- |
| P2-1 | Action « retirer la configuration AppPublisher de ce projet » + liste des fichiers modifiés affichée après chaque build | AND-005, REL-003 |
| P2-2 | Résoudre `sync` bloqué par les fichiers écrits par AppPublisher (conserver / restaurer, pas de blocage sec) | GIT-002 |
| P2-3 | Retirer ou marquer sans ambiguïté « à venir » toute la configuration iOS | IOS-001 |
| P2-4 | Supprimer le code mort : `checklist/service.ts`, `copilot-card.tsx` ; **brancher** `i18n/fr.ts` | ARCH-003, UX-005 |
| P2-5 | Retirer les sources de vérité concurrentes (`health/service`, `workflow/engine`, `diag/analyzer`) au profit du Copilot | ARCH-002 |
| P2-6 | Unifier les 4 widgets de santé en un composant paramétrable | ARCH-004, UX-002 |
| P2-7 | Tests de rendu (`@testing-library/react`) sur wizard, cockpit, build | QA-005 |
| P2-8 | Rendre l'export de bundle de diagnostic visible depuis n'importe quelle erreur | OBS-002 |

## P3 — Confort

| ID | Action | Source |
| --- | --- | --- |
| P3-1 | Un seul bloc primaire par écran ; widgets secondaires repliables | UX-003 |
| P3-2 | Désinstaller les dépendances UI non utilisées | PERF-001 |
| P3-3 | Instrumenter et lisser la rafale d'IPC au montage du Dashboard | PERF-002 |
| P3-4 | Messages actionnables quand l'allowlist refuse une commande | Parcours E |
| P3-5 | Gérer signature depuis le cockpit sans aller-retour vers `/signing` | Parcours G |

## P4 — Cosmétique

| ID | Action | Source |
| --- | --- | --- |
| P4-1 | Renommer `package.json` `name` : `tanstack_start_ts` → `apppublisher` | [06](06-audit-architecture-code.md) |

## Décompte

| Priorité | Nombre |
| --- | --- |
| P0 | 7 |
| P1 | 10 |
| P2 | 8 |
| P3 | 5 |
| P4 | 1 |
| **Total** | **31** |
