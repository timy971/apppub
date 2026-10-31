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

## Lot 12.3 — build reproductible dans un workspace jetable

Le build des projets Git gérés ne repose plus sur l'état historique du clone local.

AppPublisher :

- crée un workspace depuis le commit distant exact ;
- y applique l'intention de publication ;
- crée Android/Capacitor dans ce workspace si nécessaire ;
- utilise le profil de signature du projet source uniquement après vérification d'appartenance du worktree ;
- construit et valide l'AAB dans ce workspace ;
- copie l'AAB et son rapport dans un stockage AppPublisher durable ;
- vérifie le SHA-256 avant et après copie ;
- conserve un manifeste reliant source, identité Android, version, signature et AAB ;
- détruit ensuite le workspace temporaire.

Le clone Git source n'a donc plus besoin d'accumuler les fichiers techniques générés pour publier.

## Lot 12.4 — préflight auto-réparateur et Google Play reprenable

### Préflight

Le préflight reflète désormais le pipeline réellement capable d'auto-réparer :

- l'absence de `android/`, de wrapper Gradle ou de configuration Capacitor ne bloque plus un projet Git géré lorsque ces éléments peuvent être recréés dans le workspace ;
- les corrections sûres sont appliquées automatiquement lorsqu'elles ne modifient pas la source Git gérée ;
- les corrections qui toucheraient la source Git sont reportées dans le workspace jetable ;
- l'identifiant Android est résolu avec la même règle que le build et la publication ;
- l'utilisateur n'est sollicité que pour une décision réellement sensible ou ambiguë.

### versionCode

Lorsqu'un compte Google Play est déjà connecté, AppPublisher interroge Google avant de figer l'intention de publication.

Il prend en compte le plus grand `versionCode` visible sur les différentes pistes de l'application, puis choisit automatiquement un numéro supérieur si nécessaire. Si Google est temporairement inaccessible, le build reste possible avec les informations locales ; un refus `versionCode already used` reste traité comme filet de sécurité.

### Reprise Google Play

Après qu'un AAB a été accepté par Google, AppPublisher conserve un checkpoint local non secret lié à :

- l'application ;
- la connexion Google ;
- le SHA-256 exact de l'AAB ;
- son versionCode ;
- l'édition Google Play ;
- la dernière phase confirmée.

Après une coupure réseau tardive, AppPublisher peut donc réutiliser l'édition et le bundle déjà acceptés au lieu de recommencer l'upload.

Si la coupure survient pendant le commit final, AppPublisher vérifie d'abord si la version est déjà présente sur la piste interne avant de tenter une nouvelle publication.

Les checkpoints expirent et ne peuvent pas être réutilisés pour un autre AAB, un autre package ou une autre connexion.

### Manifeste de publication

Après succès Google Play, le manifeste durable reçoit aussi :

- piste ;
- versionCode ;
- identifiant d'édition ;
- compte public utilisé ;
- mode d'authentification ;
- date de commit ;
- indication de reprise éventuelle ;
- indication d'une récupération après résultat de commit ambigu.

## Lot 12.5 — redémarrage propre et toolchain plus autonome

### Ménage automatique au démarrage

AppPublisher nettoie maintenant les restes techniques d'une publication interrompue :

- les checkpoints Google Play expirés sont supprimés ;
- un checkpoint lié à un projet supprimé, un autre compte ou un autre package est supprimé ;
- les workspaces de publication abandonnés sont recherchés au démarrage ;
- un workspace n'est supprimé que si Git permet de prouver qu'il appartient à un dépôt situé dans l'espace `managed-projects` ;
- un dossier inconnu placé dans `publication-workspaces` est volontairement laissé intact.

Même si le projet a été retiré de l'interface, AppPublisher peut retrouver le dépôt propriétaire du worktree grâce à `--git-common-dir`, sans se fier au nom du dossier.

### Reprise après redémarrage depuis le manifeste

Le manifeste durable devient une seconde source de reprise en complément de l'historique local.

Lors de la préparation de la publication, il conserve maintenant :

- les notes de version réellement préparées ;
- la date de préparation ;
- l'AAB stable et son SHA-256 ;
- le rapport AAB ;
- le commit source ;
- la version et le versionCode ;
- l'identifiant Android ;
- le résultat Google Play lorsqu'il existe.

Au redémarrage, si l'historique ne permet plus de retrouver le build courant, AppPublisher :

1. cherche le manifeste du projet, de la version et du versionCode actifs ;
2. vérifie que le fichier AAB existe toujours ;
3. recalcule son SHA-256 et refuse un fichier modifié ;
4. retrouve le rapport et les notes préparées ;
5. reconstruit l'état `build`, `release-prepared` ou `publish` nécessaire au Publish Center.

La récupération est bornée côté processus principal au projet réellement enregistré et à son identité Android actuelle. Le renderer ne dispose d'aucune lecture arbitraire du stockage d'artefacts.

### Java / JDK automatique

AppPublisher n'exige plus que l'utilisateur sache configurer `JAVA_HOME` lorsque le JDK est déjà disponible avec Android Studio.

Ordre de résolution :

1. `JAVA_HOME` s'il pointe vers un vrai JDK contenant `java` et `keytool` ;
2. JBR/JDK embarqué d'Android Studio ;
3. JDK système connus selon la plateforme ;
4. repli sur les commandes du PATH seulement si aucun JDK fiable n'a été localisé.

Le `JAVA_HOME` détecté est injecté uniquement dans les sous-processus AppPublisher (Gradle et keytool). AppPublisher ne modifie pas les variables d'environnement système de l'utilisateur.

Cette détection est testée séparément pour éviter qu'une future modification du main process ne réintroduise une dépendance au Terminal.

## Suite — Lot 12.6

Les prochaines priorités sont :

- rendre l'installation des composants SDK Android manquants plus autonome lorsque le SDK existe déjà ;
- distinguer clairement « outil absent » de « outil installable automatiquement » ;
- réduire encore l'accès au diagnostic en mode novice ;
- restaurer automatiquement l'écran exact où une publication interrompue doit reprendre ;
- ajouter une politique de rétention des anciens AAB/manifests sans supprimer le dernier artefact utile ;
- continuer à transformer chaque bug VictoryTrack / CrânioScan en test de non-régression.

## Règle de non-régression

Chaque bug réel observé sur VictoryTrack, CrânioScan ou un futur projet devient un test automatisé.

Le critère final du Lot 12 reste :

> un utilisateur novice ne doit jamais avoir besoin d'ouvrir Terminal, Finder dans Application Support, Gradle, Android Studio ou un fichier technique pour comprendre pourquoi une publication ne fonctionne pas.
