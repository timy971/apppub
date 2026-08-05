# 14 — Roadmap

Séquencement du backlog de [13](13-backlog-priorise.md). Règle appliquée : **rien de nouveau avant que la chaîne existante soit prouvée.**

## Horizon 1 — 0 à 6 semaines : « prouver la chaîne »

Objectif : passer la fonctionnalité centrale de *probablement correcte* à *prouvée*, et rendre la porte de qualité verte.

| Semaine | Contenu | Backlog |
| --- | --- | --- |
| 1 | Tests Git déterministes ; `eslint --fix` ; test d'autonomie du dépôt | P0-1, P1-2, P1-9 |
| 2 | Fixture Capacitor + keystore généré ; premier build Android réel vérifié par `jarsigner` sur macOS | P0-2 |
| 3 | `versionCode`/`versionName` écrits par AppPublisher, idempotents, testés ; deuxième build consécutif validé | P0-3 |
| 4 | Suppression des succès simulés ; correction de `isDev` ; décision et traitement du cas Windows | P0-4, P0-6, P0-7 |
| 5 | Tests du Copilot et de `ProjectStatus` ; découpage de `main.cjs` | P1-3, P1-8 |
| 6 | Chemin de log dynamique ; retrait de configuration + affichage des fichiers modifiés | P1-10, P2-1 |

**Critère de sortie d'horizon 1** : sur une machine macOS propre, un utilisateur importe un projet Capacitor, lie un keystore, produit **deux** AAB signés successifs valides, et `npm test` + `npm run lint` retournent 0.

Tant que ce critère n'est pas atteint, aucune fonctionnalité nouvelle. C'est l'application du principe 1.

## Horizon 2 — 2 à 4 mois : « publier vraiment, et être installable »

Objectif : livrer le chaînon manquant et rendre le produit distribuable.

1. **Publication Google Play réelle** (P0-5) — API v3, compte de service au trousseau, piste `internal` seule, confirmation explicite, historique de release enrichi du résultat store. C'est le jalon qui transforme le produit.
2. **Distribution** (P1-1) — signature et notarisation macOS, DMG, canal d'auto-update. Prérequis absolu de toute monétisation : on ne facture pas un logiciel que Gatekeeper refuse d'ouvrir.
3. **Règles de plateforme** (P1-4) — `targetSdk`, test fermé, vérification d'identité. C'est ce qui fait la différence pour la cible non technique, et le moteur de règles existe déjà.
4. **Accessibilité et simplification** (P1-5, P1-6, P1-7) — 34 étiquettes, `aria-live`, retour arrière du wizard, fusion des 4 écrans d'activité.
5. **Nettoyage de dette** (P2-2 à P2-8) — dont la décision iOS : livrer ou retirer, jamais laisser un champ qui ne mène à rien.

**Critère de sortie d'horizon 2** : un utilisateur non technique dépose une mise à jour sur la piste interne de Google Play depuis AppPublisher, sans ouvrir de navigateur ni de Terminal, sur un paquet installé via DMG signé, et reçoit la mise à jour suivante d'AppPublisher automatiquement.

C'est la première fois que la définition du succès énoncée dans la vision produit serait intégralement satisfaite. **C'est le point de départ possible d'une commercialisation.**

## Horizon 3 — 5 à 12 mois : « industrialiser »

- **Pistes de release complètes** : interne → fermée → ouverte → production, avec déploiement progressif et suivi de statut lu depuis l'API.
- **Fiches store** : titre, description, captures, gérées et téléversées depuis AppPublisher.
- **Modèle économique** : licence à vie + mises à jour annuelles, cohérente avec l'absence de coût d'infrastructure (le build tourne chez l'utilisateur). L'argument de vente est déjà techniquement vrai : *« vos clés de signature ne quittent jamais votre Mac »* — aucun concurrent cloud ne peut le dire ([12](12-audit-business-concurrence.md)).
- **Windows en première classe** si la décision d'horizon 1 a été « supporter » : coffre-fort DPAPI, parité de parcours, CI Windows.
- **Qualité continue** : CI macOS + Windows, tests de rendu, `axe` sur toutes les routes, build Android nocturne.
- **Décision iOS** : soit une vraie chaîne (Xcode, `xcodebuild`, App Store Connect API, Mac obligatoire), soit un abandon assumé et documenté. Ne pas laisser ce sujet en suspens un an de plus.

## Horizon 4 — 24 à 36 mois : « ambition »

Uniquement si les horizons 1 à 3 sont tenus. Aucune de ces pistes ne doit être ouverte avant.

- **Le publieur de référence pour les créateurs no-code**, au-delà de Lovable : toute base Capacitor, quelle que soit sa convention (fin de la dépendance à `scripts/version.mjs` généralisée).
- **Orchestration multi-projets** : publier un portefeuille d'applications avec un calendrier, pour les agences et les studios.
- **Assistant de conformité store** : anticiper les refus (permissions, politique de confidentialité, contenu) avant l'envoi. C'est le prolongement naturel du Copilot et le vrai différenciateur durable face au CI/CD cloud, qui ne fait que compiler.
- **Publication comme un dépôt dans le cloud** : l'ambition énoncée dans la vision. Elle n'est atteignable qu'après l'horizon 3, et elle reste le bon cap.

## Ce qu'il ne faut pas faire

- Ajouter un huitième widget au Dashboard avant P3-1.
- Ouvrir iOS avant que la chaîne Android soit prouvée et publiée.
- Monétiser avant P1-1 (paquet signé, notarisé, mis à jour).
- Communiquer sur « publier sans devenir développeur » avant P0-5.
