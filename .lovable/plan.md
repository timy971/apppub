# Phase 1 — Stabilisation d'AppPublisher

Objectif : rendre AppPublisher **totalement fiable**. Aucune nouvelle fonctionnalité. Aucun refactoring gratuit. Une fonctionnalité que je ne peux pas prouver comme fiable sera soit corrigée, soit retirée de l'UI.

Règle transversale : **un bouton n'existe que s'il réalise une action réelle**. Sinon il est supprimé ou remplacé par un état informatif en lecture seule.

---

## Lot 0 — Audit fonctionnel complet (obligatoire, aucune modification de code)

Je parcours statiquement tout le code (`src/routes/`, `src/components/`, `src/core/`, `electron/`) et je produis une **matrice d'état réel** de toutes les fonctionnalités visibles pour l'utilisateur.

Classification, une seule valeur par ligne :
- ✅ Fonctionnelle — le code exécute réellement l'action de bout en bout.
- ⚠ Partiellement fonctionnelle — l'action existe mais un maillon manque (pas de persistance, pas de refresh, dépend d'un champ absent…).
- ❌ Cassée — le code est présent mais échoue en pratique (mauvais chemin, IPC absent, référence morte…).
- ⛔ Placeholder — bouton/carte/onglet visible mais aucune logique derrière.

Périmètre couvert par la matrice :
- **Projets** (list + cockpit) : identité, description, notes, dépôt Git, package, versions Android/iOS, keystore, notes de release, signing profile lié.
- **Dashboard 2.0** : TodayCard, CopilotHero, ProjectsGrid, ActivityTimeline, GlobalHealthCard, StatsStrip — chaque CTA.
- **Build Center** : préflight, chaque check, correction automatique, création Android, build, sync, logs, annulation, timeline.
- **Publish Center** : chaque onglet (dépôt Git, keystore, Android ID, version, release notes, checklist).
- **Signing** : création, import, inspection, association profil↔projet.
- **Support / Diagnostic / Journal / Logs / Historique / Version / Settings / Setup wizard**.
- **Sidebar + Palette (Cmd+K)** : chaque entrée.
- **Bridge Electron** : chaque IPC exposé (ouvrir Android Studio, dossier Android, dépôt Git, dossier projet, cap add android, gradlew, cap sync, keytool, security, backup, restore, fs.pickFile/Folder…).

Livrable Lot 0 : un rapport tabulaire complet posté dans le chat, section par section, chaque ligne portant l'état + la preuve courte (référence `fichier:ligne`). Aucun fichier modifié.

Je ne passe au Lot A qu'après ta validation de ce rapport.

---

## Lot A — Keystore : analyse d'abord, correction ensuite

**Étape A.1 — Diagnostic factuel** (aucune modification de code).

Je réponds précisément à chacune de ces questions, avec citations `fichier:ligne` :

1. Comment `keystorePath` est-il stocké dans le `Project` et dans le `SigningProfile` ? Absolu ou relatif ? À quel moment est-il écrit ?
2. Comment le `SigningProfile` est-il résolu au moment du build (via projet lié ? via `keystorePath` legacy ?) ?
3. Que fait exactement `BuildService` avant l'appel Gradle ? Écrit-il quelque chose dans le projet Android ? Passe-t-il des `-P` à Gradle ?
4. Que contient réellement le `build.gradle` généré par Capacitor pour ce projet ? (Je te fournis la commande précise à exécuter chez toi pour me remonter le fichier.)
5. Existe-t-il déjà un `keystore.properties` dans `android/` ? Un bloc `signingConfigs.release` a-t-il été édité manuellement ?
6. Le problème est-il :
   - (a) un `storeFile` relatif dans un template Gradle historique, résolu depuis `android/app/`, alors que le fichier est dans `android/` ?
   - (b) une valeur `keystorePath` incorrecte persistée par AppPublisher ?
   - (c) une absence totale de pont entre AppPublisher et Gradle (le chemin stocké dans AppPublisher n'est jamais consommé par Gradle) ?

**Étape A.2 — Décision**.

En fonction du diagnostic :
- Si (a) : je documente la correction à apporter au `build.gradle` du projet utilisateur et je propose un correctif automatique **ciblé** (réécriture du `storeFile` avec le bon chemin), sans créer d'injecteur global.
- Si (b) : je corrige la logique de stockage/résolution du `keystorePath` dans AppPublisher (`android-config.ts`, `signing-profile.ts`, `projects.$id.tsx`), et j'ajoute la détection « fichier déplacé → proposer d'adopter le nouveau chemin ».
- Si (c) : et seulement dans ce cas, je crée le `signing-injector` (écriture `keystore.properties` + bloc `signingConfigs` idempotent, mots de passe lus juste-à-temps depuis le Keychain, jamais persistés en clair).

Le choix sera **justifié par le diagnostic**, pas anticipé.

**Étape A.3 — Rapport de lot** (voir format ci-dessous).

---

## Lot B — Suppression des faux boutons (règle « pas de bouton mort »)

Passe unique sur toutes les routes et tous les composants. Pour chaque `onClick`, `<Link>`, `<Button asChild>`, action de menu, action de palette, action de widget :

- Si l'action est réelle → conservée.
- Si l'action renvoie vers `/projects` sans destination utile → soit ciblée sur la bonne route/onglet/champ, soit supprimée.
- Si l'action est un placeholder (« bientôt disponible », « à connecter ») → **le bouton est supprimé** et remplacé par un état en lecture seule discret, ou l'entrée disparaît complètement.

Cibles déjà repérées à traiter dans ce lot :
- `publication-card.tsx` L171 / L212 : CTA « À connecter (bientôt disponible) » pour Play Store et App Store Connect.
- `projects.$id.tsx` L818 : encart iOS « Configuration disponible — publication à venir ».
- Toute icône chevron / menu contextuel qui n'a pas d'action.

---

## Lot C — Cockpit : sauvegarde et deep-linking réellement vérifiés

Pour chaque champ éditable du cockpit :
1. Vérifier que l'édition appelle bien `ProjectsService.update` **et** invalide `CopilotBus`.
2. Vérifier que `data-cockpit-field` correspond aux `field` produits par les recommandations Copilot (voir Lot D).
3. Vérifier que le bouton crayon de `projects.tsx` amène réellement le focus sur `displayName`.

Toute recommandation Copilot ciblant un champ inexistant est un défaut à corriger dans ce lot ou dans le Lot D.

---

## Lot D — Copilot : ne jamais proposer une action impossible

Au moment de générer une recommandation, l'`engine` doit valider **avant émission** :
1. La route ciblée existe (whitelist statique dérivée du routeur).
2. L'onglet ciblé existe pour cette route.
3. Le champ ciblé (`data-cockpit-field`) existe dans le DOM déclaré (whitelist statique dérivée du cockpit).
4. Le prérequis de l'action est rempli (par exemple : ne pas proposer « lier un profil de signature » si aucun profil n'existe encore — proposer plutôt « créer un profil »).

Toute recommandation qui ne passe pas ces contrôles est filtrée silencieusement.

Widgets consommateurs (`CopilotHero`, `NextActionCard`, `copilot-strip`, `validation-summary`, `HealthCard`) sont alignés sur la même source filtrée.

---

## Lot E — Bridge Electron : validation du parcours utilisateur complet

Pour chaque commande exposée par le bridge :
1. J'identifie le bouton dans le renderer qui la déclenche.
2. Je trace l'IPC (`electron/main.cjs` → handler).
3. Je vérifie que le handler exécute réellement la commande système et renvoie un résultat exploité par l'UI.
4. Je te fournis, en fin de lot, une checklist de tests manuels macOS à cocher : ouvrir Android Studio, dossier Android, dépôt Git, dossier projet, `cap add android`, `gradlew`, `cap sync`, `keytool`, Keychain (`security`), backup, restore, sélection fichier/dossier.

Toute commande sans IPC réel côté main → bouton supprimé du renderer (règle Lot B).

---

## Lot F — Wizard de premier lancement

Parcours complet, chaque bouton « Continuer » écrit réellement dans le store, `autoFocus` reste désactivé (correctif focus thrashing conservé), sortie propre vers `/`.

---

## Format de rapport imposé à chaque fin de lot

```
### Lot X — <titre>

Problèmes détectés
1. <symptôme observé>
   Cause : <mécanisme précis, avec fichier:ligne>
   Correction : <changement effectué, fichiers touchés>
   Pourquoi cela résout réellement : <raisonnement>
   Tests manuels à cocher :
     □ …
     □ …
2. …

Validation automatique
- Typecheck ✅
- Build ✅

Validation fonctionnelle
- Checklist ci-dessus à exécuter côté macOS.
- Statut : en attente de ta validation.
```

Je n'enchaîne jamais deux lots sans ta validation explicite.

---

## Ordre d'exécution

Lot 0 (audit, aucune modif) → validation → Lot A → validation → Lot B → validation → Lot C → validation → Lot D → validation → Lot E → validation → Lot F → clôture.

## Limites honnêtes

- Je ne peux pas cliquer réellement dans l'application Electron packagée depuis ce sandbox. Toute vérification « clic → système → UI » qui dépend de macOS te reviendra sous forme de checklist explicite.
- Toute vérification statique (typecheck, build, grep exhaustif des liens et handlers, cohérence des `data-cockpit-field`, whitelist des routes/onglets) est intégrale de mon côté.

Confirme ce plan (ou ajuste-le) et je démarre le **Lot 0 — audit fonctionnel complet** immédiatement.
