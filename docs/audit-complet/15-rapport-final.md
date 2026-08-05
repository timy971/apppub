# 15 — Rapport final

Audit du 4 août 2026 — branche `edit/edt-8113ed59-36c0-4f29-bedb-15c15ec99e85`, commit `fb597f5a48828851a1c85db17d7a4818d4f79aab`, arbre propre. Environnement : Linux x64, Node v22.22.0, npm 10.9.4. **Aucun macOS ni Windows disponible** : tout constat runtime natif est `CODE` ou `NV`.

## 15.1 Verdict

**Alpha interne solide, non distribuable, non commercialisable en l'état.**

Le produit est mieux construit que la moyenne de ce qu'un audit rencontre à ce stade — et il ne fait pas ce qu'il promet.

Ces deux affirmations sont vraies simultanément, et c'est le résultat central de cet audit.

## 15.2 Ce qui est réellement bon

À protéger dans toute refonte future :

1. **L'architecture de sécurité est l'actif principal du projet.** Allowlist d'exécution par arguments exacts (pas par expression régulière), registre de chemins confinés, `contextIsolation` avec préchargement nommé, mots de passe hors `argv` transmis par `stdin`, redaction testée des logs exportés. C'est du travail d'ingénierie sérieux, et c'est le fondement du seul argument commercial que les concurrents cloud ne peuvent pas copier : *les clés ne quittent jamais la machine*.
2. **Le découpage en moteurs de règles** (`CopilotRule`, `ProjectRule`) est le bon point d'extension. Chaque contrainte produit future — règles Play, `targetSdk`, testeurs — est un fichier, pas une refonte.
3. **La règle de succès de build est stricte et honnête** : retour 0 **et** AAB présent **et** signature vérifiée. Un faux positif est structurellement empêché.
4. **La traduction des erreurs** et le **préflight** sont les deux fonctionnalités les plus alignées avec la promesse produit, et elles sont testées.
5. **L'observabilité** est complète : logs datés, journal métier, export de bundle de diagnostic caviardé.

## 15.3 Ce qui bloque

Cinq faits, chacun suffisant à empêcher une distribution.

| # | Fait | Doc |
| --- | --- | --- |
| 1 | **La publication n'existe pas.** Aucun appel d'API store dans tout le dépôt : le produit prépare, puis ouvre le navigateur. Le mot du nom du produit — *publisher* — n'est pas implémenté. | [09](09-audit-build-android-publication.md) AND-003 |
| 2 | **La chaîne de build signé n'est prouvée nulle part.** Ni test d'intégration, ni exécution réelle constatée. La fonctionnalité qui porte toute la valeur est en statut *probablement correcte*. | AND-001, QA-003 |
| 3 | **La deuxième release est cassée.** `versionCode` n'est jamais incrémenté : Play refusera le second AAB, après qu'AppPublisher aura affiché « build réussi » et « release préparée ». C'est la violation la plus grave du principe 7 (confiance). | AND-002 |
| 4 | **La porte de qualité est rouge.** `npm test` échoue (4 tests Git, dont le test de confinement de sécurité) ; `npm run lint` remonte 336 problèmes. Aucune release n'est validable au sens strict. | QA-001, GIT-001 |
| 5 | **Le paquet n'est pas distribuable.** macOS en cible `dir`, non signé, non notarisé, sans installeur ni canal de mise à jour. Un défaut découvert chez un utilisateur ne peut pas être corrigé chez lui. Sur Windows, la signature est impossible faute de coffre-fort. | BUILD-004, V-03 |

## 15.4 Écart promesse / réalité

La vision produit énonce six critères de succès. Résultat : **quatre tenus, un partiel, un absent** — et l'absent est celui qui définit le produit.

| Critère | État |
| --- | --- |
| Créer une nouvelle version | partiel (dépend d'un script du projet utilisateur) |
| Générer un build Android | non prouvé |
| Préparer la publication | **tenu** |
| Comprendre les erreurs | **tenu** |
| Retrouver son historique | **tenu** |
| Publier régulièrement | **absent**, et cassé au 2ᵉ passage |
| Sans ouvrir le Terminal | tenu sur macOS, cassé sur Windows |

Le produit est aujourd'hui, très précisément : **un assistant de préparation de release Android, pédagogique et sûr, sur macOS.** C'est utile, c'est défendable, et ce n'est pas ce qui est annoncé.

## 15.5 Décompte des constats

| Priorité | Nombre |
| --- | --- |
| P0 — bloque la distribution | **7** |
| P1 — bloque la commercialisation | **10** |
| P2 — dette structurante | 8 |
| P3 — confort | 5 |
| P4 — cosmétique | 1 |
| **Total** | **31** |

Détail et définitions de « terminé » : [13](13-backlog-priorise.md). Séquencement : [14](14-roadmap.md).

## 15.6 Go / No-Go

| Décision | Verdict | Condition |
| --- | --- | --- |
| **Distribuer à des utilisateurs externes** | **NO-GO** | Les 7 P0 |
| **Distribuer à un cercle fermé de testeurs macOS accompagnés** | **GO sous conditions** | P0-1 à P0-4 et P0-6, plus un avertissement explicite que la publication reste manuelle |
| **Communiquer sur « publier sans devenir développeur »** | **NO-GO** | P0-5 (publication réelle) |
| **Monétiser** | **NO-GO** | P0 complets + P1-1 (paquet signé, notarisé, mis à jour) |
| **Poursuivre le développement** | **GO franc** | L'ossature justifie l'investissement ; le chemin critique est court et identifié |
| **Ouvrir iOS** | **NO-GO** | Après l'horizon 2 |

## 15.7 Recommandation en une phrase

Le projet n'a pas un problème de qualité d'ingénierie, il a un problème de **fin de chaîne** : arrêter toute nouvelle fonctionnalité, prouver le build signé par un test d'intégration réel, corriger `versionCode`, brancher l'API Google Play, signer et notariser le paquet — cinq chantiers, deux à quatre mois, et le produit tient sa promesse.

## 15.8 Limites de cet audit

1. Electron n'a jamais été **lancé** : aucun macOS ni Windows disponible. Tout le comportement du main process est audité par lecture de code.
2. Aucun SDK Android, JDK Android, projet Capacitor réel ni keystore : la chaîne de build est auditée par lecture de code et fixtures unitaires.
3. Aucun compte Google Play ni App Store Connect : rien n'a été téléversé, conformément à la consigne.
4. Le renderer a été exercé via le serveur de développement web, donc avec le bridge **mocké** : l'UI est prouvée, le comportement natif ne l'est pas.
5. Les chiffres de tarification concurrentielle de [12](12-audit-business-concurrence.md) sont datés du 4 août 2026 et doivent être revérifiés à la lecture.
