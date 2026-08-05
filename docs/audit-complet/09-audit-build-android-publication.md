# 09 — Build Android, signature, publication

C'est le document central : la chaîne auditée ici est celle qui porte la totalité de la valeur du produit.

## 9.1 La chaîne implémentée

```text
  1. preflight            src/core/build/preflight.ts        Java, SDK, android/, keystore
  2. ensureExecutable     gradle:ensureExecutable            chmod +x gradlew (Unix)
  3. ensureSigningPatch   gradle:ensureSigningPatch          patch idempotent de app/build.gradle
  4. resolveKeystore      signing:resolveKeystore            normalisation en chemin absolu (~ résolu)
  5. prepareBuild         signing:prepareBuild               secrets Keychain → ORG_GRADLE_PROJECT_*
  6. exec:run             gradlew bundleRelease               allowlist + process-manager
  7. verifyAab            signing:verifyAab                  jarsigner -verify + SHA-256
```

Règle de succès codée : **code de retour 0 ET fichier AAB présent ET signature JAR vérifiée**. C'est la bonne règle, et elle est rare. À conserver telle quelle.

## 9.2 Ce qui est solide

| Élément | Preuve |
| --- | --- |
| Injection Gradle idempotente, avec détection de conflits | `src/core/build/signing-injector.ts` + `signing-injector.test.ts` (vitest vert) |
| Chemins keystore forcés en absolu | `signing:resolveKeystore` |
| Secrets jamais sur disque, jamais dans `argv` | correctif `keychain_argv_pw`, `electron/signing-session.cjs` |
| `ORG_GRADLE_PROJECT_*` allowlistés explicitement | `electron/execution-policy.cjs`, `exec:validateEnv` |
| Préflight bloquant avant Gradle | `src/core/build/preflight.ts` + `preflight.test.ts` |
| Redaction des chemins et mots de passe dans les logs exportés | `electron/diagnostic-redaction.cjs` + test |
| Patch Gradle couvert côté main process | `tests/gradle-signing-patch.node-test.cjs` (vert) |

## 9.3 Constat majeur : la chaîne n'est pas prouvée

**Constat AND-001 (P0)** — `NV`. Aucun build Android réel n'a jamais été exécuté et vérifié dans un environnement d'audit. Il manque, dans l'environnement : JDK Android, Android SDK, un projet Capacitor réel, un keystore de test. Toute la chaîne est validée par **lecture de code et tests unitaires sur des fixtures**, jamais par un AAB signé produit et vérifié.

Conséquence directe : la fonctionnalité qui justifie le produit est en statut *probablement correcte*. Ce n'est pas un statut acceptable pour une distribution.

Ce qu'il faut, et qui est réalisable :
1. Un **projet Capacitor de référence** committé dans le dépôt (`fixtures/demo-app/`), minimal, avec `android/`.
2. Un **keystore de test** généré à la volée par le test (`keytool -genkeypair`), jamais committé.
3. Un test d'intégration, exécuté manuellement sur macOS puis en CI macOS, qui produit un AAB et le vérifie par `jarsigner`. Le test échoue si l'AAB n'est pas signé par l'empreinte attendue.

Tant que ce test n'existe pas, aucun constat de cette section ne peut passer de `CODE` à `EXEC`.

## 9.4 versionCode : la release suivante est cassée

**Constat AND-002 (P0)** — Aucune occurrence d'écriture de `versionCode` dans la chaîne Android. La montée de version repose sur `scripts/version.mjs`, script propre à la convention interne et **absent des projets réels des utilisateurs**.

Google Play refuse tout AAB dont le `versionCode` n'est pas strictement supérieur au précédent. Donc :
- Première release : possible.
- Deuxième release : **refusée par le store**, sans que l'utilisateur comprenne pourquoi, puisque AppPublisher aura affiché « build réussi » et « release préparée ».

C'est le pire type de défaut au regard du principe 7 (confiance) : le produit valide un artefact que le store rejettera.

Correctif attendu : écrire `versionCode`/`versionName` dans `android/app/build.gradle` (ou `gradle.properties`) depuis AppPublisher, de façon idempotente, avec la même rigueur que `signing-injector.ts`, et **sans dépendre d'un script du projet utilisateur**.

## 9.5 Publication : inexistante

**Constat AND-003 (P0)** — Aucun appel d'API store dans tout le dépôt. Le Publish Center prépare, enregistre un `PublishRecord`, puis ouvre le navigateur (`shell:openExternal`). L'action de publier reste **entièrement manuelle**.

Chemin recommandé, sans serveur et compatible avec la promesse « rien ne quitte votre machine » :
- Google Play Developer API v3, méthode `edits` → `bundles.upload` → `tracks.update` → `commit`.
- Authentification par **compte de service** JSON, stocké dans le trousseau comme les mots de passe de keystore.
- Piste initiale : dépôt sur la piste `internal`, jamais `production`, avec confirmation explicite. Conforme aux principes 3 et 4.

## 9.6 Règles de plateforme non modélisées

**Constat AND-004 (P1)** — Aucune modélisation de : `targetSdk` minimum annuel, test fermé obligatoire pour les nouveaux comptes personnels (20 testeurs / 14 jours selon la policy citée en [12](12-audit-business-concurrence.md)), vérification d'identité développeur, obligation AAB.

Ce sont les murs sur lesquels la cible non technique se cogne **en premier**, avant Gradle. Le moteur `ProjectRule` existe déjà : trois à quatre règles supplémentaires couvrent l'essentiel, pour un coût faible et un gain produit élevé.

## 9.7 iOS

**Constat IOS-001 (P2)** — Les règles iOS existent (`src/core/projects/status/rules/ios.ts` : `bundleId`, etc.) et l'UI expose une configuration `publishing.ios`, mais **aucune chaîne de build iOS n'existe**. Xcode et un Mac sont de toute façon obligatoires ([12](12-audit-business-concurrence.md)).

Risque produit : l'UI promet une plateforme qui n'est pas livrée. Soit les champs iOS sont marqués « à venir » de façon non ambiguë, soit ils sont retirés. Un champ éditable qui ne mène à rien est un placeholder, explicitement interdit par les consignes produit.

## 9.8 Réversibilité de l'injection

**Constat AND-005 (P2)** — `signing-injector` modifie `app/build.gradle` de l'utilisateur. L'injection est idempotente, mais aucune procédure de **retrait** n'est exposée à l'utilisateur, et une interruption entre patch et build laisse le fichier modifié sans que l'utilisateur en soit informé. Voir GIT-002 : ce fichier modifié bloquera le prochain `git sync`.

Attendu : une action « retirer la configuration AppPublisher de ce projet », et une mention explicite dans le récapitulatif de build de la liste des fichiers modifiés.

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| AND-001 | Chaîne de build signé jamais prouvée en exécution réelle | P0 |
| AND-002 | `versionCode` non incrémenté → 2ᵉ release refusée par Play | P0 |
| AND-003 | Aucune publication store (préparation seulement) | P0 |
| AND-004 | Règles de plateforme Play non modélisées | P1 |
| IOS-001 | Configuration iOS exposée sans chaîne de build | P2 |
| AND-005 | Injection Gradle sans retrait ni annonce des fichiers modifiés | P2 |
