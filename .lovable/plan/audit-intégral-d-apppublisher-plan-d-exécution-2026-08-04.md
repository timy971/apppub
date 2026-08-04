# Audit intégral d'AppPublisher — plan d'exécution

Objectif : produire un audit factuel, contradictoire et actionnable, couvrant produit, parcours, UX/UI, accessibilité, architecture, Electron, sécurité, Git, build Android/signature, publication, tests, performance, fiabilité, observabilité, multiplateforme, conformité, business et roadmap. Aucune modification du code fonctionnel pendant l'audit : seuls les documents d'audit sont créés.

## Livrables

Dossier `docs/audit-complet/` avec les 16 fichiers demandés :

`00-index-audit.md` (sommaire + avancement), `01-etat-des-lieux.md`, `02-audit-produit.md`, `03-inventaire-fonctionnel.md`, `04-parcours-utilisateurs.md`, `05-audit-ux-ui-accessibilite.md`, `06-audit-architecture-code.md`, `07-audit-electron-securite.md`, `08-audit-git-projets-distants.md`, `09-audit-build-android-signature-publication.md`, `10-audit-tests-qualite.md`, `11-audit-performance-fiabilite-observabilite.md`, `12-audit-business-concurrence.md`, `13-backlog-priorise.md`, `14-roadmap.md`, `15-rapport-final.md`.

Chaque fichier est écrit dès que sa passe est terminée (pas de rédaction finale unique), et `00-index-audit.md` est mis à jour au fil de l'eau.

## Conventions imposées à tous les constats

- Statut de preuve obligatoire : Vérifié par exécution / Vérifié par lecture du code / Partiellement vérifié / Inféré / Non vérifiable ici / Non implémenté / Simulé ou mocké / Cassé / Obsolète / Code mort.
- Identifiants uniques par famille : `FUNC-`, `UX-`, `A11Y-`, `ARCH-`, `CODE-`, `ELEC-`, `SEC-`, `GIT-`, `BUILD-`, `SIGN-`, `PUB-`, `QA-`, `PERF-`, `REL-`, `OBS-`, `PLAT-`, `PRIV-`, `BUS-`.
- Fiche problème complète : titre, catégorie, sévérité P0–P4, preuve (fichier + zone de lignes), repro, attendu, réel, impact utilisateur, impact technique/commercial, probabilité, recommandation, effort XS–XL, dépendances, critères d'acceptation.
- Toute affirmation « ça marche » exige une preuve d'exécution ou une lecture de code citée. Sinon : Inféré ou Non vérifiable.

## Déroulé des passes

**Passe 1 — État des lieux (`01`)**
Branche, commit, état Git, fichiers non suivis. Versions Node/npm/Electron/Vite/React/TypeScript. Scripts réellement disponibles (`test`, `typecheck`, `lint`, `build`, `build:electron`, `pack:mac`, `pack:win`, `make:icons`, `sync:version`). Lockfile. Structure des dossiers, points d'entrée (`src/server.ts`, `src/start.ts`, `src/main.electron.tsx`, `electron/main.cjs`, `electron/preload.cjs`). Dépendances risquées ou incohérentes. Schéma Mermaid de l'architecture réelle.

**Passe 2 — Commandes de validation (`01`, section dédiée)**
Exécution des scripts existants uniquement : `lint`, `typecheck`, `test` (vitest + `node --test tests/*.node-test.cjs`), `build`, `build:electron`, et tentative de `pack:mac`/`pack:win` avec constat explicite des limites du sandbox Linux. Tableau Commande / Résultat / Durée / Avertissements / Erreurs / Conclusion. Vérification que chaque code de sortie 0 produit bien l'artefact attendu (présence réelle de `dist/`, `dist-electron/`, `dist-app/`). Chaque échec est documenté, cause racine séparée des erreurs secondaires, et l'audit continue.

**Passe 3 — Produit (`02`)**
Problème résolu, cibles, clarté de la promesse en 30 s, écart promesse/capacités réelles, zones de faux sentiment de simplicité ou de sécurité, comparaison rationnelle contre terminal / Android Studio / Capacitor / PWABuilder / Expo / Codemagic / Appflow / accompagnement humain. Notes sur 10 justifiées (valeur, utilité, différenciation, maturité, crédibilité, adoption, potentiel, rétention).

**Passe 4 — Inventaire fonctionnel (`03`)**
Balayage exhaustif de `src/routes/*`, `src/components/*`, `src/core/*`, `src/features/android-signing/*`, `electron/*`, avec table ID / fonctionnalité / écran ou fichier / état réel / preuve / valeur / risque / UX / tests / priorité. Chasse explicite aux boutons sans effet, formulaires non persistés, écrans déconnectés du bridge Electron, succès prématurés, mocks dans un parcours présenté comme réel (`src/core/bridge/web.ts`), champs persistés jamais lus (ex. `buildCommand`), placeholders iOS/publication, doublons et navigations mortes.

**Passe 5 — Parcours (`04`)**
Parcours A à J tels que définis, avec préconditions, étapes, attendu, obtenu, frictions, gravité, probabilité d'abandon, confiance, recommandations. Vérification en preview headless (Playwright) pour ce qui est atteignable côté renderer ; les branches nécessitant le main process Electron réel, un keystore, un SDK Android ou macOS sont marquées Non vérifiable ici avec le test précis qui les couvrirait.

**Passe 6 — UX, UI, accessibilité (`05`)**
Table par écran (objectif, compréhension, frictions, risque d'erreur, améliorations, priorité), lecture par persona (débutant, no-code, dev occasionnel, dev expérimenté, freelance, agence). Cohérence lexicale build/package/signer/générer/publier/envoyer au store. Design system : tokens, contrastes, états hover/focus/disabled/loading/error, densité, débordements, scrolls imbriqués, ressenti desktop vs site web. Accessibilité : parcours clavier, ordre et visibilité du focus, pièges de focus, labels, annonces d'erreurs, cibles tactiles, dépendance à la couleur, structure des titres, `prefers-reduced-motion`, zoom. Défauts classés bloquant/majeur/modéré/mineur. Wireframes textuels pour les écrans les plus faibles.

**Passe 7 — Architecture et qualité du code (`06`)**
Frontières renderer/preload/main, surface exposée par `contextBridge`, typage et validation des contrats IPC, propagation des erreurs, état et stockage (`src/core/storage`, `electron/durable-store.cjs`), tâches longues, annulation, idempotence, atomicité, migrations, extensibilité iOS/plugins. Schéma actuel + schéma cible + écarts. Notes sur 10. Registre de dette technique (fichiers surdimensionnés, `any`, catch génériques, promesses non attendues, code mort, logique métier dans l'UI, TODO/FIXME).

**Passe 8 — Electron et sécurité (`07`)**
`BrowserWindow`/`webPreferences`, `contextIsolation`, `sandbox`, CSP d'`index.html`, navigation externe, permissions, single instance, cycle de vie, crashs, processus enfants, chemins packagés, différences dev/packagé. Registre de vulnérabilités (ID, sévérité critique→informationnel, composant, scénario d'exploitation, impact, probabilité, preuve, correction) : injection d'arguments, path traversal, contournement d'allowlist (`electron/execution-policy.cjs`, `electron/path-security.cjs`), secrets keystore, fuite dans les logs, exécution de code tiers d'un projet importé (npm/Gradle) et avertissement utilisateur. Séparation vulnérabilité exploitable / mauvaise pratique / durcissement / hypothèse.

**Passe 9 — Git et projets distants (`08`)**
Validation d'URL et protocoles, auth et stockage d'identifiants, clone, branches, fetch, détection de nouveaux commits, divergence, modifications locales, conflits, sous-modules, LFS, remote modifié, accès révoqué, historique réécrit, rollback, traçabilité commit→build. Vérification des risques d'écrasement silencieux et de perte du lien build/commit. Proposition d'un modèle d'état Git lisible par un non-développeur.

**Passe 10 — Commandes, build Android, signature, publication (`09`)**
Allowlist et construction d'arguments, cwd, env, timeouts, annulation, concurrence, nettoyage. Chaîne Capacitor → Android : détection, `cap add/sync`, Java/SDK/Gradle, package ID, versionCode/Name, icônes, manifest, debug/release, APK/AAB, localisation et validation d'artefact, reproductibilité. Signature : modèle de données, création/import, alias, secrets, keychain, migration, plus les scénarios d'échec listés (faux `.jks`, corrompu, mauvais mot de passe, alias absent, keystore déplacé/supprimé, chemins accentués, profil orphelin ou partagé). Risque produit majeur : perte définitive du keystore — vérifier l'avertissement et la stratégie de sauvegarde. Publication : distinguer générer / signer / vérifier / téléverser / soumettre / publier, et statuer sans complaisance sur Google Play et iOS, avec architecture cible et roadmap iOS.

**Passe 11 — Tests et qualité (`10`)**
Inventaire des 15 suites `tests/*.node-test.cjs` et des tests vitest de `src/core/**`. Classement par type, table Zone / tests existants / qualité / cas couverts / cas manquants / risque de régression. Analyse des assertions faibles, tests structurels ne pouvant échouer, mocks irréalistes, écarts web simulé vs Electron réel et dev vs packagé. Matrice de test minimale avant commercialisation (macOS/Windows, environnements complets/incomplets, réseau, projets anormaux, interruption, redémarrage, restauration).

**Passe 12 — Performance, fiabilité, observabilité (`11`)**
Temps de démarrage et de première peinture mesurés en preview, taille de bundle mesurée, coût d'analyse projet, listes volumineuses, console de logs, fuites de listeners et de processus, croissance du stockage. Résilience : fermeture brutale, crash, build interrompu, disque plein, fichier verrouillé, store corrompu, migration de schéma, mise à jour d'AppPublisher ; atomicité, sauvegardes, détection d'état incomplet. Modèle d'état de tâche proposé. Logs et diagnostic : emplacement, format, rotation, niveaux, corrélation, redaction (`electron/diagnostic-redaction.cjs`), export, reconstitution d'un incident par le support. Multiplateforme et confidentialité traités ici : chemins, exécutables, permissions, signature/notarisation, données locales vs transmises.

**Passe 13 — Business et concurrence (`12`)**
Vendabilité en l'état, conditions, cibles, fonctionnalités payantes vs confort vs anti-remboursement, charge de support, risques de responsabilité et de réputation, modèles économiques et niveaux de prix crédibles, promesse commerciale honnête aujourd'hui et après corrections. Comparatif concurrentiel marqué comme indicatif et daté pour toute donnée externe non vérifiable.

**Passe 14 — Backlog, remédiation, roadmap (`13`, `14`)**
Backlog consolidé et classé (P0 interdiction de commercialiser → P4 confort) avec vue Rang / ID / sujet / priorité / impact / effort / risque / dépendances / lot. Plan de remédiation en lots (objectif, problèmes, valeur, dépendances, risques, effort, ordre, tests à ajouter, critères de sortie), découpage adapté aux problèmes réellement observés et écarts expliqués. Roadmap 0–6 semaines, 2–4 mois, 5–12 mois, vision 24–36 mois, chaque évolution avec problème résolu, cible, valeur, difficulté, dépendances, risque, indicateur de succès.

**Passe 15 — Rapport final (`15`)**
Résumé exécutif non technique, verdict unique justifié, Go/No-Go point par point, 10 forces observées, 20 faiblesses classées, risques majeurs, liste explicite des fonctionnalités trompeuses ou incomplètes, corrections préalables obligatoires (P0/P1), quick wins, plan recommandé, vision, conclusion sans complaisance. Scorecard finale par domaine (note, confiance, justification) avec note globale plafonnée tant qu'un P0 subsiste.

## Garde-fous respectés

Aucune modification du code applicatif, aucune publication, aucun secret ni compte de production, aucun keystore créé ou remplacé, aucun push, aucune suppression de fichier utilisateur, aucune réécriture d'historique Git. Les seules commandes lancées sont les scripts de vérification déjà présents dans `package.json` et des lectures en preview headless. Un échec n'arrête pas l'audit : il est documenté avec sa cause probable et ce qu'il empêche de vérifier.
