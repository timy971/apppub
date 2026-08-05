# Audit intégral AppPublisher — Index

Audit réalisé le **4 août 2026**, branche `edit/edt-8113ed59-36c0-4f29-bedb-15c15ec99e85`, commit `fb597f5a48828851a1c85db17d7a4818d4f79aab`, arbre de travail propre (`git status --porcelain` vide).

Environnement d'audit : sandbox Linux x64, Node v22.22.0, npm 10.9.4. **Aucune vérification macOS ou Windows réelle n'a pu être faite** : tous les constats dépendant du système hôte sont marqués explicitement.

## Statuts de preuve utilisés

| Statut | Signification |
| --- | --- |
| `EXEC` | Vérifié par exécution dans cet audit |
| `CODE` | Vérifié par lecture du code (fichier + lignes citées) |
| `PART` | Partiellement vérifié |
| `INFER` | Inféré, non prouvé |
| `NV` | Non vérifiable dans l'environnement actuel |
| `NI` | Non implémenté |
| `MOCK` | Simulé / mocké |
| `BROKEN` | Cassé |
| `DEAD` | Code mort ou probablement inutilisé |

## Sommaire

| # | Document | Portée | État |
| --- | --- | --- | --- |
| 01 | [État des lieux](01-etat-des-lieux.md) | Dépôt, versions, scripts, commandes de validation exécutées | **Rédigé** |
| 02 | [Audit produit](02-audit-produit.md) | Promesse vs réalité, proposition de valeur, cibles, 7 principes | **Rédigé** |
| 03 | [Inventaire fonctionnel](03-inventaire-fonctionnel.md) | Toutes les fonctionnalités, promesse UI vs réalité code | **Rédigé** |
| 04 | [Parcours utilisateurs](04-audit-parcours-utilisateurs.md) | Parcours A à J et premier point de rupture | **Rédigé** |
| 05 | [UX / UI / accessibilité](05-audit-ux-ui-accessibilite.md) | 14 écrans, densité, a11y mesurée | **Rédigé** |
| 06 | [Architecture & code](06-audit-architecture-code.md) | Couches, volumétrie, code mort, dette | **Rédigé** |
| 07 | [Electron & sécurité](07-audit-electron-securite.md) | Registre de vulnérabilités (V-00 à V-14) | **Rédigé** |
| 08 | [Git & projets distants](08-audit-git-projets-distants.md) | Cycle de vie Git, tests rouges, autonomie du dépôt | **Rédigé** |
| 09 | [Build Android, signature, publication](09-audit-build-android-publication.md) | Chaîne Capacitor→Play, versionCode, iOS | **Rédigé** |
| 10 | [Tests & qualité](10-audit-tests-qualite.md) | Mesures d'exécution, couverture par domaine | **Rédigé** |
| 11 | [Perf, fiabilité, observabilité](11-audit-performance-fiabilite-observabilite.md) | Poids, résilience, logs | **Rédigé** |
| 12 | [Business & concurrence](12-audit-business-concurrence.md) | Comparatif sourcé, modèle économique | **Rédigé** |
| 13 | [Backlog priorisé](13-backlog-priorise.md) | 31 constats, P0→P4, définitions de « terminé » | **Rédigé** |
| 14 | [Roadmap](14-roadmap.md) | 0-6 sem., 2-4 mois, 5-12 mois, 24-36 mois | **Rédigé** |
| 15 | [Rapport final](15-rapport-final.md) | Verdict, Go/No-Go | **Rédigé** |

Note : les documents initialement numérotés jusqu'à 15 couvrent l'intégralité du périmètre demandé ; aucun document n'est manquant.

## Verdict en une ligne

**Alpha interne solide, non commercialisable en l'état** : l'ossature Electron est sérieusement pensée (allowlist d'exécution, isolation, redaction des logs), mais la chaîne de valeur promise — build Android signé puis publication — n'est **prouvée nulle part**, la publication store est **inexistante** (préparation uniquement), la 2ᵉ release est cassée (`versionCode`), le paquet macOS est **non signé et non notarisé sans installeur**, et la porte de qualité (`npm run lint`, `npm test`) est **rouge**. Détail : [15-rapport-final.md](15-rapport-final.md).

## Décompte des constats

| Priorité | Nombre |
| --- | --- |
| P0 — bloque la distribution | 7 |
| P1 — bloque la commercialisation | 10 |
| P2 — dette structurante | 8 |
| P3 — confort | 5 |
| P4 — cosmétique | 1 |
| **Total** | **31** |


## Limites de cet audit

1. Aucun macOS/Windows disponible : Electron n'a pas pu être **lancé**. Tout ce qui concerne le comportement runtime du main process est `CODE` ou `NV`, jamais `EXEC`.
2. Aucun SDK Android, JDK Android, `gradlew` de projet réel, ni keystore de test : la chaîne de build/signature est auditée par lecture de code uniquement.
3. Aucun compte Google Play / App Store Connect : rien n'a été téléversé, conformément à la consigne.
4. Le renderer a été exercé via le serveur de développement web (bridge mocké), ce qui reflète l'UI mais **pas** le comportement natif.
