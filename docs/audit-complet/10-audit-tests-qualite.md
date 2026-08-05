# 10 — Tests & qualité

## 10.1 Mesures d'exécution (`EXEC`, 4 août 2026)

| Porte de qualité | Commande | Résultat |
| --- | --- | --- |
| Types | `npm run typecheck` | **vert** |
| Unitaires renderer | `npx vitest run` | **vert** — 12 fichiers, **49 tests** |
| Main process | `node --test tests/*.node-test.cjs` | **ROUGE** — 58 tests, **54 pass / 4 fail** |
| Lint | `npx eslint .` | **ROUGE** — **336 problèmes** (316 erreurs, 20 avertissements) |
| Build Electron | `vite build --config vite.electron.config.ts` | **vert** |
| Test intégré (`npm test` = vitest + node --test) | — | **ROUGE** (à cause des 4 échecs Git) |

**Constat QA-001 (P0)** — `npm test` est rouge. Le projet n'a donc, au sens strict, **aucune release validable**. Détail des échecs : [08](08-audit-git-projets-distants.md) GIT-001.

**Constat QA-002 (P1)** — 336 problèmes de lint, dont **316 corrigibles automatiquement** (`--fix`, essentiellement `prettier/prettier`). Une porte rouge pour des raisons cosmétiques finit toujours par être ignorée, ce qui masque les vrais avertissements (20 warnings React) le jour où ils comptent. À vider en une passe, puis à verrouiller.

## 10.2 Couverture par domaine

| Domaine | Tests | Verdict |
| --- | --- | --- |
| Sécurité des chemins | `path-security.node-test.cjs` | **couvert** |
| Allowlist d'exécution | `execution-policy.node-test.cjs` | **couvert** |
| Frontière Electron | `electron-boundary.node-test.cjs` | **couvert** |
| Sécurité fenêtre / navigation | `window-security.node-test.cjs` | **couvert** |
| Redaction des logs | `diagnostic-redaction.node-test.cjs` | **couvert** |
| Session de signature | `signing-session.node-test.cjs` | **couvert** |
| Patch Gradle (main) | `gradle-signing-patch.node-test.cjs` | **couvert** |
| Injection Gradle (renderer) | `signing-injector.test.ts` | **couvert** |
| Préflight de build | `preflight.test.ts` | **couvert** |
| Traduction d'erreurs | `translator.test.ts` | **couvert** |
| Inspection / import de keystore | `keystore-inspector.test.ts`, `keystore-importer.test.ts` | **couvert** |
| Artefact de publication | `artifact.test.ts` | **couvert** |
| Sauvegardes | `backup-manager.node-test.cjs`, `backup/service.test.ts` | **couvert** |
| Git | `git-projects.node-test.cjs` | **ROUGE** |
| **Build Android de bout en bout** | — | **AUCUN** |
| **Publication store** | — | sans objet (non implémenté) |
| **Copilot (moteur + 9 règles)** | — | **AUCUN** |
| **Moteur `ProjectStatus`** | — | **AUCUN** |
| **Composants React / rendu** | — | **AUCUN** |
| **Accessibilité automatisée** | — | **AUCUN** |

## 10.3 Analyse

La couverture n'est pas faible : elle est **mal répartie**. Ce qui est testé est ce qui a été identifié comme risque de sécurité. Ce qui n'est pas testé est ce qui porte la valeur produit.

**Constat QA-003 (P0)** — Aucun test de la chaîne de build Android de bout en bout. Voir [09](09-audit-build-android-publication.md) AND-001. C'est le trou de couverture le plus coûteux du projet.

**Constat QA-004 (P1)** — Le Copilot est déclaré « source unique de vérité » et pilote la prochaine action affichée sur tous les écrans. Il n'a **aucun test**. Ses 9 règles sont pourtant du calcul pur sur un état d'entrée : c'est le code le plus facile et le plus rentable à tester du projet. Idem pour le moteur `ProjectStatus`.

**Constat QA-005 (P2)** — Aucun test de rendu (aucun `@testing-library/react` dans les dépendances). Les régressions UX de ces dernières semaines — gel du wizard, focus perdu, bouton inactif — sont exactement la classe de défauts qu'un test de rendu attrape en une seconde. Chaque occurrence a coûté plusieurs allers-retours de diagnostic manuel.

**Constat QA-006 (P2)** — Aucune vérification automatisée de l'accessibilité, alors que 34 champs sans étiquette sont mesurés ([05](05-audit-ux-ui-accessibilite.md) A11Y-001). Un test `axe` sur les 14 routes verrouillerait la correction.

## 10.4 Ordre de correction recommandé

1. Rendre `npm test` vert (Git déterministe) — sinon rien d'autre n'a de valeur.
2. `eslint --fix`, puis traiter les 20 avertissements React à la main.
3. Tests du Copilot et de `ProjectStatus` (rapide, gros gain de confiance).
4. Test d'intégration build Android sur macOS, avec fixture Capacitor et keystore généré.
5. `@testing-library/react` + un test de rendu par écran critique (wizard, cockpit, build).
6. `axe` sur les 14 routes.

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| QA-001 | `npm test` rouge : aucune release validable | P0 |
| QA-003 | Aucun test de build Android de bout en bout | P0 |
| QA-002 | 336 problèmes de lint (316 auto-corrigibles) | P1 |
| QA-004 | Copilot et `ProjectStatus` non testés malgré leur rôle central | P1 |
| QA-005 | Aucun test de rendu — les régressions UX passent | P2 |
| QA-006 | Aucun test d'accessibilité | P2 |
