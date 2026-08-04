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
| 01 | [État des lieux](01-etat-des-lieux.md) | Dépôt, versions, scripts, commandes de validation | Terminé |
| 02 | [Audit produit](02-audit-produit.md) | Proposition de valeur, cibles, concurrence directe, notes | Terminé |
| 03 | [Inventaire fonctionnel](03-inventaire-fonctionnel.md) | Toutes les fonctionnalités + état réel | Terminé |
| 04 | [Parcours utilisateurs](04-parcours-utilisateurs.md) | Parcours A à J | Terminé |
| 05 | [UX / UI / accessibilité](05-audit-ux-ui-accessibilite.md) | Écrans, design system, a11y | Terminé |
| 06 | [Architecture & code](06-audit-architecture-code.md) | Couches, dette technique | Terminé |
| 07 | [Electron & sécurité](07-audit-electron-securite.md) | Registre de vulnérabilités | Terminé |
| 08 | [Git & projets distants](08-audit-git-projets-distants.md) | Cycle de vie Git | Terminé |
| 09 | [Build Android, signature, publication](09-audit-build-android-signature-publication.md) | Chaîne Capacitor→Play, iOS | Terminé |
| 10 | [Tests & qualité](10-audit-tests-qualite.md) | Inventaire, trous, matrice minimale | Terminé |
| 11 | [Performance, fiabilité, observabilité](11-audit-performance-fiabilite-observabilite.md) | Perf, résilience, logs, multiplateforme, confidentialité | Terminé |
| 12 | [Business & concurrence](12-audit-business-concurrence.md) | Viabilité, modèle, comparatif | Terminé |
| 13 | [Backlog priorisé](13-backlog-priorise.md) | P0→P4, lots | Terminé |
| 14 | [Roadmap](14-roadmap.md) | 0-6 semaines, 2-4 mois, 5-12 mois, 24-36 mois | Terminé |
| 15 | [Rapport final](15-rapport-final.md) | Verdict, Go/No-Go, scorecard | Terminé |

## Verdict en une ligne

**Alpha interne solide, non commercialisable en l'état** : l'ossature Electron est sérieusement pensée (allowlist d'exécution, isolation, redaction des logs), mais la chaîne de valeur promise — build Android signé puis publication — n'est **prouvée nulle part**, la publication store est **inexistante** (préparation uniquement), le paquet macOS est **non signé et non notarisé sans installeur**, et la porte de qualité (`npm run lint`, `npm test`) est **rouge**. Détail : [15-rapport-final.md](15-rapport-final.md).

## Limites de cet audit

1. Aucun macOS/Windows disponible : Electron n'a pas pu être **lancé**. Tout ce qui concerne le comportement runtime du main process est `CODE` ou `NV`, jamais `EXEC`.
2. Aucun SDK Android, JDK Android, `gradlew` de projet réel, ni keystore de test : la chaîne de build/signature est auditée par lecture de code uniquement.
3. Aucun compte Google Play / App Store Connect : rien n'a été téléversé, conformément à la consigne.
4. Le renderer a été exercé via le serveur de développement web (bridge mocké), ce qui reflète l'UI mais **pas** le comportement natif.
