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

## Sommaire et avancement

| # | Document | Portée | État |
| --- | --- | --- | --- |
| 01 | [État des lieux](01-etat-des-lieux.md) | Dépôt, versions, scripts, commandes de validation exécutées | **Rédigé** |
| 03 | [Inventaire fonctionnel](03-inventaire-fonctionnel.md) | Toutes les fonctionnalités, promesse UI vs réalité code | **Rédigé** |
| 07 | [Electron & sécurité](07-audit-electron-securite.md) | Registre de vulnérabilités (V-00 à V-14) | **Rédigé** |
| 12 | [Business & concurrence](12-audit-business-concurrence.md) | Comparatif sourcé, modèle économique | **Rédigé** |
| 02 | Audit produit | Proposition de valeur, cibles | À rédiger (matière marché disponible dans 12) |

| 04 | Parcours utilisateurs | Parcours A à J | À rédiger — matière collectée |
| 05 | UX / UI / accessibilité | Écrans, a11y, mesures Playwright | À rédiger — mesures faites (34 champs sans label, focus initial absent en étape 1 du wizard, wizard sans retour arrière) |
| 06 | Architecture & code | Couches, code mort, dette | À rédiger — matière collectée |
| 08 | Git & projets distants | Cycle de vie Git | À rédiger — matière collectée |
| 09 | Build Android, signature, publication | Chaîne Capacitor→Play, iOS | À rédiger — matière collectée |
| 10 | Tests & qualité | Couverture, trous | À rédiger — mesures faites |
| 11 | Perf, fiabilité, observabilité | Poids, résilience, logs | À rédiger — mesures faites |
| 12 | Business & concurrence | Modèle, comparatif | À rédiger (recherche marché en cours) |
| 13 | Backlog priorisé | P0→P4 | À rédiger |
| 14 | Roadmap | 0-6 sem., 2-4 mois, 5-12 mois, 24-36 mois | À rédiger |
| 15 | Rapport final | Verdict, Go/No-Go | À rédiger |

Les documents « à rédiger » reposent sur des preuves **déjà collectées et vérifiées** dans cette session (exécutions, lectures de code avec `fichier:ligne`, mesures Playwright) ; il ne reste que la mise en forme.


## Verdict en une ligne

**Alpha interne solide, non commercialisable en l'état** : l'ossature Electron est sérieusement pensée (allowlist d'exécution, isolation, redaction des logs), mais la chaîne de valeur promise — build Android signé puis publication — n'est **prouvée nulle part**, la publication store est **inexistante** (préparation uniquement), le paquet macOS est **non signé et non notarisé sans installeur**, et la porte de qualité (`npm run lint`, `npm test`) est **rouge**. Détail : [15-rapport-final.md](15-rapport-final.md).

## Limites de cet audit

1. Aucun macOS/Windows disponible : Electron n'a pas pu être **lancé**. Tout ce qui concerne le comportement runtime du main process est `CODE` ou `NV`, jamais `EXEC`.
2. Aucun SDK Android, JDK Android, `gradlew` de projet réel, ni keystore de test : la chaîne de build/signature est auditée par lecture de code uniquement.
3. Aucun compte Google Play / App Store Connect : rien n'a été téléversé, conformément à la consigne.
4. Le renderer a été exercé via le serveur de développement web (bridge mocké), ce qui reflète l'UI mais **pas** le comportement natif.
