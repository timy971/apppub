# 08 — Git & projets distants

## 8.1 Périmètre implémenté

`electron/git-projects.cjs` (465 lignes) expose 5 handlers : `git:check`, `git:inspectRemote`, `git:clone`, `git:status`, `git:sync`.

| Capacité | État | Preuve |
| --- | --- | --- |
| Détecter la présence de Git | OK | `git:check` |
| Inspecter un dépôt distant avant clonage (branches, dernier commit) | `CODE` | `git:inspectRemote` |
| Cloner une branche précise et rapporter le commit exact | `BROKEN en test` | test 35 rouge |
| Lire l'état local (propre / modifié) | `BROKEN en test` | test 36 rouge |
| Détecter une mise à jour distante sans toucher aux fichiers | `BROKEN en test` | test 37 rouge |
| Refuser toute opération hors du dossier de projets géré | `BROKEN en test` | test 38 rouge |
| Commit / push / branche / merge | **NI — hors périmètre assumé** (« AppPublisher n'est pas un client Git ») | — |

## 8.2 Résultat d'exécution

`EXEC`, `node --test tests/*.node-test.cjs` :

```text
# tests 58
# pass 54
# fail 4
not ok 35 - clones a selected branch and reports its exact commit
not ok 36 - blocks sync on local changes and fast-forwards a clean copy
not ok 37 - checks the remote and reports an available update without changing files
not ok 38 - refuses Git operations outside the managed projects directory
```

Les quatre échecs sont **tous** dans `tests/git-projects.node-test.cjs`. La cause probable est environnementale (sandbox : pas d'identité Git configurée, pas d'accès réseau pour un dépôt distant réel), mais **elle n'est pas prouvée** : ces tests créent normalement des dépôts locaux temporaires, donc un échec n'est pas explicable par le seul réseau.

**Constat GIT-001 (P0)** — Quatre tests Git rouges, dont le test de confinement. Deux conséquences :
1. La porte de qualité `npm test` est **rouge** : aucune release ne peut être considérée comme validée.
2. La garantie de sécurité la plus sensible du module Git — « aucune opération hors du dossier géré » — n'est appuyée par aucun test qui passe.

Action attendue : rejouer sur une machine avec Git installé et identité configurée ; si les tests échouent encore, ce sont des régressions fonctionnelles, pas du bruit d'environnement. Dans les deux cas, les tests doivent devenir déterministes (identité Git posée dans le test via `-c user.name`/`-c user.email`, dépôt source local uniquement, aucun accès réseau).

## 8.3 Cycle de vie d'un projet distant

Le modèle implémenté est **lecture seule** et c'est un choix défendable au regard du principe « AppPublisher n'est pas un client Git » :

```text
  inspectRemote → clone (branche choisie) → status (propre ?) → sync (fast-forward only)
```

- `sync` refuse d'avancer si des modifications locales existent : conforme au principe 4 (réversibilité) et au principe 3 (aucune surprise).
- Aucune écriture d'historique (pas de commit, pas de push) : la machine de l'utilisateur ne peut pas être mise dans un état Git incohérent par AppPublisher.

**Constat GIT-002 (P2)** — Le mode lecture seule crée un angle mort produit : un utilisateur Lovable modifie son code **dans Lovable**, pas localement. Après `sync`, ses modifications locales éventuelles (par exemple celles écrites par AppPublisher lui-même : `build.gradle` patché, `version.json`) bloquent le `sync` suivant. Le produit peut donc se saborder lui-même au deuxième cycle.

Recommandation : distinguer explicitement les fichiers **écrits par AppPublisher** et proposer une action « conserver / restaurer » plutôt qu'un blocage sec.

## 8.4 Le dépôt d'AppPublisher lui-même

Point traité et **résolu** durant les sessions précédentes, consigné ici pour mémoire car il a coûté plusieurs cycles :

- `build/icon.png`, `build/icon.icns`, `build/icon.ico`, `build/entitlements.mac.plist` étaient **absents du dépôt** alors que `scripts/pack.cjs` les exige (lignes 79–89 : `fail()` si absents).
- Cause : le dossier `build/` était ignoré par une règle `.gitignore` non locale au dépôt.
- Correctif : négations explicites `!/build/` et `!/build/**`.

**Constat GIT-003 (P1)** — Aucun garde-fou n'empêche la réapparition du problème. Un dépôt non autonome est indétectable localement. Recommandation : un test qui vérifie, via `git ls-files`, que chaque fichier exigé par `scripts/pack.cjs` est **suivi** — pas seulement présent sur le disque.

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| GIT-001 | 4 tests Git rouges dont le test de confinement ; `npm test` rouge | P0 |
| GIT-003 | Aucun test d'autonomie du dépôt (fichiers exigés par `pack.cjs` suivis par Git) | P1 |
| GIT-002 | Les fichiers écrits par AppPublisher bloquent le `sync` suivant | P2 |
