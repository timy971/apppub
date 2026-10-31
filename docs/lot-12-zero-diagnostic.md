# Lot 12 — Publication autonome / zéro diagnostic utilisateur

## Objectif

AppPublisher doit permettre à une personne qui ne connaît ni Git, ni Gradle, ni Capacitor, ni Android SDK, ni versionCode de publier une application sur Google Play sans ouvrir un terminal et sans devoir interpréter une erreur technique.

Le parcours cible est :

**Importer → Préparer → Publier**

Les détails techniques restent disponibles uniquement en mode avancé / diagnostic.

## Principe d’architecture

Une publication ne doit plus dépendre de l’état historique du dossier géré par AppPublisher.

On sépare désormais trois couches :

1. **Source gérée**
   - dépôt Git importé ;
   - permet de suivre la branche, le remote et les changements ;
   - ne doit plus être considéré comme un dossier de build fiable à long terme.

2. **Intention de publication**
   - version visible ;
   - versionCode ;
   - applicationId ;
   - identité de signature attendue ;
   - paramètres de publication Google Play ;
   - corrections AppPublisher nécessaires.
   
   Cette intention appartient à AppPublisher et doit pouvoir être réappliquée sur une source propre.

3. **Workspace de publication jetable**
   - créé depuis le commit distant exact de la branche sélectionnée ;
   - détaché du clone principal via Git worktree ;
   - propre au moment de sa création ;
   - reçoit ensuite uniquement les transformations nécessaires à la publication ;
   - peut être supprimé puis recréé sans perte de configuration utilisateur.

## Lot 12.1 — workspace jetable

Le premier socle introduit un `PublicationWorkspaceManager`.

Avant de créer le workspace, AppPublisher :

- valide que le dépôt local correspond toujours au remote attendu ;
- fetch la branche distante sans modifier les fichiers locaux ;
- lit le SHA exact de `refs/remotes/origin/<branche>` ;
- crée un worktree détaché depuis ce SHA ;
- vérifie que `HEAD` correspond exactement au SHA attendu ;
- vérifie que le workspace est propre ;
- vérifie que le worktree appartient réellement au dépôt source attendu.

Le clone géré peut être sale : ses modifications ou fichiers générés ne sont pas copiés dans le workspace de publication.

À la suppression, AppPublisher vérifie de nouveau l’appartenance du workspace avant d’appeler `git worktree remove --force`.

## Ce que 12.1 ne fait volontairement pas encore

Le build n’est pas encore basculé directement sur le workspace.

Raison : l’AppPublisher actuel applique certaines modifications dans le clone géré (version, versionCode, Android, signature). Construire immédiatement depuis le seul commit distant pourrait donc perdre une sélection utilisateur récente.

La prochaine étape est de transformer ces modifications en **intention de publication reproductible**, appliquée dans le workspace propre avant le build.

## Lot 12.2 — intention de publication

Objectif :

- lire la version/versionCode choisis dans AppPublisher ;
- lire l’applicationId attendu ;
- lire le profil de signature attendu ;
- appliquer ces valeurs dans le workspace propre avec les moteurs de correction existants ;
- vérifier le résultat avant toute compilation ;
- ne jamais demander à l’utilisateur de committer/push manuellement une correction technique AppPublisher.

## Lot 12.3 — préflight auto-réparateur

Le préflight devient un moteur de préparation :

- source distante à jour ;
- workspace créé ;
- dépendances cohérentes ;
- Capacitor Android présent ou recréé ;
- Gradle wrapper présent/exécutable ;
- SDK/JDK détectés/configurés ;
- identité Android alignée ;
- version/versionCode alignés ;
- signature attendue disponible ;
- ancien AAB supprimé ;
- Google OAuth/Play testés avant l’étape finale.

Chaque correctif sûr est appliqué automatiquement. L’utilisateur ne voit une décision que lorsqu’elle est réellement ambiguë ou sensible.

## Lot 12.4 — publication Google Play autonome

- interrogation du dernier versionCode connu ;
- choix automatique du prochain numéro sûr ;
- upload piste interne ;
- reprise après erreur sans refaire les étapes valides ;
- manifeste de publication conservé avec commit source, AAB, signature et résultat Google Play.

## Règle de non-régression

Chaque bug réel observé sur VictoryTrack, CrânioScan ou un futur projet devient un test automatisé.

Le critère final du Lot 12 est simple :

> un utilisateur novice ne doit jamais avoir besoin d’ouvrir Terminal, Finder dans Application Support, Gradle, Android Studio ou un fichier technique pour comprendre pourquoi une publication ne fonctionne pas.
