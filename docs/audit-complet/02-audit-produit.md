# 02 — Audit produit

## 2.1 La promesse, telle qu'écrite

La connaissance projet énonce une promesse unique et mesurable : *« permettre à toute personne capable de créer une application de la publier sans devenir développeur »*, et une définition explicite du succès en six points — créer une version, générer un build Android, préparer la publication, comprendre les erreurs, retrouver l'historique, publier régulièrement, **sans ouvrir le Terminal**.

Cette promesse est la bonne grille de lecture de l'audit : elle est falsifiable. Le tableau ci-dessous la confronte au code.

| Critère de succès annoncé | État réel | Preuve |
| --- | --- | --- |
| Créer une nouvelle version | `PART` — dépend d'un `scripts/version.mjs` propre à la convention interne ; `versionCode` Android jamais écrit | [03](03-inventaire-fonctionnel.md), [09](09-audit-build-android-publication.md) |
| Générer un build Android | `PART` — pipeline complet et instrumenté, mais **jamais prouvé en exécution réelle** (aucun SDK/JDK/keystore dans l'environnement d'audit) | [09](09-audit-build-android-publication.md) |
| Préparer sa publication | `OK` — Publish Center, checklist, notes de version, vérification d'artefact + `jarsigner` | `src/components/publish-center/**` |
| Comprendre les erreurs | `OK` — `src/core/errors/translator.ts` + tests | [10](10-audit-tests-qualite.md) |
| Retrouver son historique | `OK` — `HistoryService`, journal, logs datés | `src/core/history/service.ts` |
| **Publier** régulièrement | `NI` — **aucun appel d'API store**. Le produit ouvre le navigateur | [03](03-inventaire-fonctionnel.md) |
| Sans ouvrir le Terminal | `PART` macOS / `BROKEN` Windows (pas de coffre-fort de mots de passe) | [07](07-audit-electron-securite.md) V-03 |

**Constat PROD-001 (P0)** — Cinq critères sur sept sont tenus ou proches. Le sixième — *publier* — est le seul qui justifie l'existence du produit et il est absent. AppPublisher est aujourd'hui un **assistant de préparation de release**, pas un publieur.

## 2.2 Proposition de valeur réelle

Ce que le produit fait objectivement bien, aujourd'hui, et que les concurrents ne font pas :

1. **Les clés ne quittent jamais la machine.** Trousseau macOS, mots de passe hors `argv` (correctif `keychain_argv_pw`), allowlist d'exécution stricte (`electron/execution-policy.cjs`), redaction des logs (`electron/diagnostic-redaction.cjs`). Argument différenciant fort et **techniquement vrai**.
2. **Traduction des erreurs en langage humain.** `src/core/errors/translator.ts` est la fonctionnalité la plus alignée avec la promesse et la plus testée.
3. **Un moteur d'intention.** Le Copilot (`src/core/copilot/engine.ts`, 9 règles) transforme un état projet en *prochaine action*. C'est structurellement la bonne réponse au problème « quelle commande dois-je taper ? ».
4. **Préflight avant build.** `src/core/build/preflight.ts` intercepte les échecs avant Gradle, là où le message serait incompréhensible.

**Constat PROD-002 (P2)** — La valeur réelle est concentrée dans la *pédagogie et la sécurité locale*, pas dans l'automatisation de bout en bout. Le positionnement marketing devrait suivre ce constat plutôt que le contredire.

## 2.3 Cibles

| Cible annoncée | Adéquation réelle | Commentaire |
| --- | --- | --- |
| Créateurs Lovable | **Forte** — mais uniquement sur macOS et si le projet suit la convention `scripts/version.mjs` | Le cœur de cible est donc plus étroit que le discours |
| Développeurs low-code | Moyenne | Ont souvent déjà un pipeline cloud |
| Indépendants / startups | Moyenne | Comparent au prix : Expo EAS livre le *submit* pour 99 $/mois ([12](12-audit-business-concurrence.md)) |
| Professionnels de santé, petites équipes | **Faible aujourd'hui** — c'est la cible la moins tolérante à un échec Gradle, et celle qui a le plus besoin des contraintes Play (testeurs, `targetSdk`) que le produit ne modélise pas | BIZ-001 |
| Ingénieurs Android | Hors cible assumée | Cohérent |

**Constat PROD-003 (P1)** — La cible la plus citée (non-technique, santé) est celle pour laquelle le produit est le moins prêt : sans upload store ni modélisation des règles Play, l'utilisateur non technique reste bloqué **après** AppPublisher.

## 2.4 Respect des sept principes fondateurs

| Principe | Verdict | Preuve |
| --- | --- | --- |
| 1. Simplicité avant richesse | **Non respecté** — 14 routes, sidebar chargée, doublons Dashboard/Cockpit/Publish sur la même information de santé | `src/routes/`, [05](05-audit-ux-ui-accessibilite.md) |
| 2. Une seule vérité | **Largement respecté** — le Copilot centralise ; reste `HealthService`, `ChecklistService`, `WorkflowEngine` en concurrence résiduelle | [06](06-audit-architecture-code.md) |
| 3. Aucune surprise | Respecté — préflight, dialogues de confirmation, plan annoncé avant exécution | `preflight-card.tsx` |
| 4. Réversibilité | Respecté côté projet (`BackupService`, backups avant build/publish) ; **non respecté** pour l'injection Gradle en cas d'interruption | [09](09-audit-build-android-publication.md) |
| 5. Transparence | Respecté — logs, console de build, export de bundle de diagnostic | `electron/diagnostic-redaction.cjs` |
| 6. Progression | Respecté — timeline d'étapes, score de préparation | `steps-timeline.tsx` |
| 7. Confiance | **Fragile** — le bridge web *simule* les opérations sans avertissement persistant : un utilisateur peut croire à un succès qui n'a jamais eu lieu | `src/core/bridge/web.ts:34,58` |

**Constat PROD-004 (P0)** — Le bridge web simulé (`fakeExec`, versions « (simulé) ») viole directement les principes 3, 5 et 7. En packaging Electron il n'est pas utilisé, mais tout écart de configuration ou tout futur déploiement web rendrait le produit **menteur par construction**. Un bandeau permanent non masquable est le minimum ; refuser de charger l'UI hors Electron est plus sûr.

## 2.5 Ce que le produit devrait être et n'est pas encore

- Un **publieur** : `androidpublisher` v3 (Google Play Developer API) via compte de service, en local. C'est le chaînon manquant et il est réalisable sans serveur.
- Un **gardien des règles du store** : `targetSdk` minimum, test fermé 20 testeurs / 14 jours, vérification d'identité. Trois règles `ProjectRule` supplémentaires suffiraient à couvrir les murs les plus fréquents.
- **Multiplateforme sur ses propres promesses** : soit Windows est supporté (coffre-fort DPAPI), soit le produit s'annonce macOS-only.

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| PROD-001 | La publication — cœur de la promesse — n'existe pas | P0 |
| PROD-004 | Bridge web simulé sans avertissement : risque de faux succès | P0 |
| PROD-003 | La cible non technique est la moins bien servie (règles Play absentes) | P1 |
| PROD-002 | Valeur réelle (sécurité locale, pédagogie) sous-exploitée dans le positionnement | P2 |
