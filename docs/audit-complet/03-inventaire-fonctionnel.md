# 03 — Inventaire fonctionnel complet

Colonnes : **Promesse UI** (ce que l'écran laisse croire), **Réalité code** (ce qui se passe), **Statut** (`EXEC`/`CODE`/`PART`/`INFER`/`NV`/`NI`/`MOCK`/`BROKEN`/`DEAD`), **Preuve**, **Risque**.

## 3.1 Périmètre déclaré

13 routes (`CODE` `src/routes/`) : `/` (dashboard), `/setup` (wizard), `/projects`, `/projects/$id` (cockpit), `/build`, `/publish`, `/signing`, `/version`, `/history`, `/journal`, `/logs`, `/diagnostic`, `/settings`.
26 domaines métier (`src/core/*`), 1 module fonctionnel (`src/features/android-signing`), 16 modules main process.

## 3.2 Tableau d'inventaire

### Gestion de projets

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Importer un dossier local | « Parcourir » ouvre un dialogue natif, le projet est analysé | Réel en Electron : `dialog.showOpenDialog` + canonicalisation + approbation de racine | `CODE` | `electron/main.cjs` (`projects:chooseFolder`), `path-security.cjs:141-149` | — |
| Détection du projet | package.json, Capacitor, android/, ios/, git détectés | Réel en Electron | `CODE` | `electron/main.cjs` `projects:detect` | — |
| Importer depuis Git | clone HTTPS/SSH, branche par défaut détectée | Réel, durci (refus des URL avec identifiants, `protocol.file.allow=never`, `--single-branch`) | `CODE` | `electron/git-projects.cjs:17-60,354-388` | Sous-modules et LFS ignorés (voir doc 08) |
| Liste, recherche, filtres, favoris | Recherche + filtres + favoris | Réel, local | `CODE` | `src/routes/projects.tsx:499-670` | — |
| Cockpit projet (7 onglets) | Fiche riche éditable | Réel, avec traçabilité de provenance des champs (`fieldSources`) | `CODE` | `src/core/projects/sources.ts`, `src/routes/projects_.$id.tsx` | — |
| Nom d'affichage vs nom technique | Nom éditable, nom technique en lecture seule | Réel | `CODE` | `src/core/types.ts`, cockpit onglet Identité | — |
| Champ « Commande de build » | Champ éditable avec badge de provenance | **Jamais lu par le pipeline de build** | `NI`/`DEAD` | `src/core/types.ts:82` déclaré, `projects_.$id.tsx:714-720` édité ; aucune lecture dans `core/build/service.ts`, `core/build/gradle.ts`, `core/operations/android-build.ts` | **Élevé** : faux réglage, l'utilisateur croit personnaliser sa commande |
| Champ `lastHealthScore` | — (non affiché) | Déclaré, jamais lu ni écrit | `DEAD` | `src/core/types.ts:106`, 0 autre occurrence | Dette |
| Champ `notes` | Notes libres du projet | Écrit/lu uniquement par le formulaire, aucune consommation (ni copilote, ni release notes) | `PART` | `projects_.$id.tsx:464` | Faible |

### Santé, copilote, checklists

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Score de santé | Note globale + détails | Calcul réel à partir des règles de statut | `CODE` | `src/core/health/service.ts` + `service.test.ts` (testé) | — |
| Moteur de statut projet | Blocages expliqués + action cliquable | Réel : règles par domaine avec `RuleAction` (tab/section/field) | `CODE` | `src/core/projects/status/rules/*` | — |
| Copilote (plan, prochaine action) | Plan priorisé, navigation directe | Réel, réactif via bus | `CODE` | `src/core/copilot/engine.ts`, `use-copilot-plan.ts`, `copilot-target.test.ts` | Cibles vers routes dynamiques à vérifier (doc 04) |
| Assistant de configuration | Étapes guidées | Réel | `CODE` | `src/components/setup-assistant/*` | — |
| Lexique centralisé FR | — | `src/core/i18n/fr.ts` **n'est importé nulle part** ; tous les textes sont en dur | `DEAD` | `EXEC` `rg "core/i18n" src` → 0 résultat | Moyen : la centralisation annoncée n'existe pas ; l'internationalisation devra tout reprendre |
| Ancienne checklist | — | `src/core/checklist/service.ts` + `src/components/checklist-view.tsx` jamais importés | `DEAD` | `EXEC` `rg` → 0 référence | Dette |
| `copilot-card.tsx`, `dashboard/copilot-hero.tsx` | — | Jamais importés | `DEAD` | `EXEC` `rg` → 0 référence | Dette |

### Version

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Choisir le type de changement (correction / fonctionnalité / majeure) et prévisualiser | Aperçu `1.0.0 → 1.0.1`, build +1 | Calcul local correct | `CODE` | `src/core/version/service.ts:5-37`, `version.service.test.ts` | — |
| Appliquer la nouvelle version | « La version de votre application est mise à jour » | Exécute **`node scripts/version.mjs patch\|minor\|major` dans le projet de l'utilisateur**, puis relit `<projet>/version.json` | `BROKEN` | `src/core/version/service.ts:74-97` ; l'allowlist ne permet que cette commande (`electron/execution-policy.cjs:100-115`) | **Critique** : cette convention (`scripts/version.mjs` + `version.json` à la racine) est celle d'AppPublisher lui-même, **pas** celle des projets Capacitor/Lovable. Sur un projet réel, la commande échoue (`exitCode≠0` → exception) et la version n'est jamais modifiée |
| Écriture de `versionCode`/`versionName` dans Android | Implicite : « votre application aura la version X » | **Aucune écriture** dans `android/app/build.gradle` ni `AndroidManifest.xml` | `NI` | `src/core/projects/android-config.ts:1-38` ne touche que l'état applicatif ; `EXEC` `rg "versionCode|versionName" electron/` → 0 résultat | **Critique** : Google Play refuse un AAB dont le `versionCode` n'a pas augmenté. L'utilisateur voit « version 1.0.2 » dans AppPublisher et livre un AAB en `versionCode 1` |

### Build Android

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Préflight (10+ contrôles) | Contrôles bloquants avant build | Réel : vérifie dossiers, `gradlew`, Java/`JAVA_HOME`, SDK/`ANDROID_HOME`, `adb --version`, Capacitor, et **valide le keystore par un vrai `keytool -list`** | `CODE` | `src/core/build/preflight.ts:114-433` | — |
| Corrections automatiques | « Corriger » sur certains blocages | Réel : `chmod +x gradlew`, adoption de keystore déplacé, création `android/` | `CODE` | `preflight.ts:66-83,298-330`, `gradle-executable.cjs` | — |
| Créer `android/` | `npx cap add android` + compilation de contrôle | Réel, avec `assembleDebug` de vérification | `CODE` | `src/core/capacitor/service.ts:273-309` | — |
| Séquence de build | install → build web → `cap sync` → patch signature → `gradlew bundleRelease` | Réelle, dans cet ordre | `CODE` | `src/core/build/service.ts:140-363` | — |
| Journal temps réel | Console de logs streamée | Réel (`onLine` via IPC), redaction des secrets | `CODE` | `electron/diagnostic-redaction.cjs`, `log-console.tsx` | Redaction heuristique (doc 07 V-10) |
| Annulation | Bouton « Annuler » | Réel : `AbortSignal` → `exec:cancel` → kill de l'arbre de processus | `CODE` | `service.ts:46-48`, `process-manager.cjs:36-75` | — |
| Verdict de réussite | « Build réussi » + empreinte du certificat | Exige exit 0 **et** fichier AAB non vide **et** `jarsigner -verify` OK **et** empreinte SHA-256 comparée au profil | `CODE` | `service.ts:326-362` | Contrôle sérieux ; **jamais exécuté de bout en bout dans un environnement réel** (`NV`) |
| Deux builds simultanés | — | Aucun verrou par projet : deux builds peuvent patcher le même `build.gradle` et écrire dans le même dossier de sortie | `NI` | Aucun mutex dans `core/build`, `core/operations` ; `process-manager.cjs:87-93` ne déduplique que `(sender, executionId)` | Moyen-élevé : corruption possible |
| Build iOS | — | Inexistant | `NI` | `EXEC` `rg "xcodebuild|\.ipa|Podfile"` dans `src/` → 0 résultat | — |

### Signature Android

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Créer un keystore | Formulaire → `.jks`/`.p12` généré | Réel (`keytool -genkeypair`) | `CODE` | `keystore-creator.ts` | — |
| Importer un keystore | Sélection de fichier + détection des alias | Réel (`keytool -list` + parsing robuste FR/EN) | `CODE` | `keystore-importer.ts:51-125`, `keystore-inspector.test.ts` | — |
| Stockage des mots de passe | « Dans le trousseau système » | Réel sur macOS (`security`, mot de passe transmis par stdin) | `CODE` | `electron/main.cjs` `secrets:set` | — |
| Stockage sur Windows/Linux | — | `secretsSupported()` renvoie `available:false` → le profil reste `secureStorage:"unavailable"` | `NI` | `electron/main.cjs:2127-2152`, `keystore-creator.ts:143-152` | **Critique hors macOS** (voir ci-dessous) |
| Build signé hors macOS | Implicite : `pack:win` existe | `validateStoredKeystore` renvoie `keychain-unavailable` avant toute signature → `signing:prepareBuild` échoue | `BROKEN` (Windows/Linux) | `electron/main.cjs` `validateStoredKeystore` (`support.available` → sortie immédiate) | **Critique** : la fonction centrale du produit est **impossible** sur Windows, alors que la cible Windows est configurée dans electron-builder |
| Injection Gradle | Patch idempotent, inerte sans propriétés | Réel, marqueur unique, refus si bloc corrompu, détection des conflits `signingConfigs`/`afterEvaluate` | `CODE` | `electron/gradle-signing-patch.cjs:8-48`, `src/core/build/signing-injector.ts:110-134` | — |
| Sauvegarde du keystore | Message « sauvegardez-le en lieu sûr » | Aucune fonction d'export/copie automatique | `NI` | `keystore-creator.ts:171-172` (texte seul) | **Élevé** : perte du keystore = mises à jour Play définitivement impossibles |
| Supprimer un profil | Suppression immédiate | Aucune vérification des projets qui le référencent | `NI` | `profiles-store.ts:68-73` | Moyen : `signingProfileId` orphelin (rattrapé au préflight suivant) |

### Publication

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Vérifier l'artefact | « AAB vérifié » | Réel : `fs.stat` + `jarsigner -verify` | `CODE` | `src/core/publish/artifact.ts:30-98` | — |
| « Préparer la release » | Bouton principal du Publish Center | Enregistre un `PublishRecord` local + sauvegarde optionnelle. **N'envoie rien** | `CODE` | `publish-center.tsx:96-145` | Moyen : l'historique enregistre `kind:"publish", outcome:"success"` — vocabulaire ambigu pour un non-technicien |
| Notes de version | Générateur de notes | Réel, local | `CODE` | `src/core/release-notes/service.ts` | — |
| Envoi vers Google Play | « Ouvrir Play Console » + « Prochainement… » | `shell.openExternal("https://play.google.com/console/")`. Aucun appel d'API store | `NI` (assumé) | `handoff-card.tsx:9,34-41` ; `EXEC` recherche `androidpublisher|googleapis|appstoreconnect` → 0 résultat | Honnête, mais c'est **le cœur de la promesse produit** qui manque |
| App Store Connect / TestFlight | « Intégration prévue » | Inexistant | `NI` | `store-targets.tsx:41-48` | — |
| Historique / journal / logs / diagnostic | Traçabilité + export | Réel, avec redaction | `CODE` | `src/core/history/service.ts`, `journal/logger.ts`, `diag/*` | — |

### Réglages, sauvegardes, divers

| Fonction | Promesse UI | Réalité code | Statut | Preuve | Risque |
| --- | --- | --- | --- | --- | --- |
| Sauvegarde / restauration de projet | Créer et restaurer une sauvegarde | Réel, opérations natives dédiées fichier par fichier | `CODE` | `electron/backup-manager.cjs` + tests | — |
| Export/import des données AppPublisher | Boutons dans Réglages | Réel (`storage.exportFile/importFile`) | `CODE` | `electron/durable-store.cjs` + tests | Pas de migration de schéma (doc 07 V-12) |
| Modes Découverte / Assistant / Expert | Filtrage de l'affichage | Réel, purement présentationnel | `CODE` | `mode-gate.tsx`, `mode-badge.tsx` | — |
| Langue anglaise | `English (bientôt)` | Option désactivée | `NI` | `src/routes/settings.tsx:181-183` | Faible (assumé) |
| Indicateur de runtime web/Electron | « Aperçu Web (simulé) » | Présent **uniquement dans /settings** | `PART` | `src/routes/settings.tsx:192-199` | Moyen (voir 3.3) |

## 3.3 Le bridge web : succès simulés sans avertissement persistant

`CODE` `src/core/bridge/web.ts:11-16` — le fichier annonce lui-même : « Toutes les opérations système sont simulées de façon déterministe […] Aucune opération n'est réellement exécutée. »

| Domaine | Comportement en mode web | Statut |
| --- | --- | --- |
| `system.detect` | versions Node/npm/git/Java/SDK factices marquées `(simulé)` | `MOCK` succès |
| `projects.detect/scan` | détection **toujours positive**, 3 projets fictifs (« CranioScan », « Orthopulse », « VictoryTrack ») | `MOCK` succès |
| `exec.run` | rejoue des lignes de log fixes, renvoie **toujours `exitCode: 0`** | `MOCK` succès |
| `git.*` | SHA factice, toujours `up-to-date` / `clean` | `MOCK` succès |
| `androidPreparation`, `gradle`, `backups` | toujours `ok: true` | `MOCK` succès |
| `secrets.*`, `signing.*` | `ok:false` avec message explicite « Aperçu Lovable — keytool n'est disponible que… » | `MOCK` échec honnête |

**Constat UX-001 (P1)** — l'avertissement de runtime n'existe que dans `/settings` (`CODE` `settings.tsx:192-199`). Sur le dashboard, le cockpit, le Build Center et le Publish Center, un utilisateur en aperçu web voit un score de santé, un statut Git, des versions détectées et un build « réussi » **entièrement fictifs**, sans aucun bandeau. Le seul rappel ponctuel est « Artefact simulé disponible dans l'aperçu web. » (`CODE` `src/core/publish/artifact.ts:50-57`).

Correction attendue : bandeau persistant en mode web (`isElectron() === false`) dans l'en-tête global, et neutralisation des scores/statuts calculés à partir de données simulées.

## 3.4 Synthèse — ce qui « marche » vraiment

| Bloc | Verdict |
| --- | --- |
| Gestion de projets, cockpit, santé, copilote | **Solide** (`CODE`, testé en partie) |
| Import Git | **Solide et durci**, deux trous connus (sous-modules, LFS) |
| Préflight & création `android/` | **Solide** |
| Build Android signé (macOS) | **Plausible mais non prouvé** (`NV`) — aucune exécution réelle nulle part, ni en test, ni dans cet audit |
| Build Android signé (Windows/Linux) | **Impossible** (`BROKEN`) — pas de coffre-fort de mots de passe |
| Gestion de version | **Cassée sur les projets réels** (`BROKEN`) et **jamais propagée à Android** (`NI`) |
| Publication store | **Inexistante** (`NI`), assumée dans les textes |
| iOS | **Inexistante** (`NI`), présente visuellement |
