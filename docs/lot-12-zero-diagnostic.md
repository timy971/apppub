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

## Suite — Lot 12.5

Les prochaines priorités sont :

- nettoyage automatique des workspaces/checkpoints orphelins ;
- toolchain Android encore plus autonome ;
- diagnostic uniquement en dernier recours et masqué en mode novice ;
- exploitation du manifeste pour une reprise complète du parcours après redémarrage ;
- transformation systématique de chaque nouveau bug réel en test de non-régression.

## Règle de non-régression

Chaque bug réel observé sur VictoryTrack, CrânioScan ou un futur projet devient un test automatisé.

Le critère final du Lot 12 reste :

> un utilisateur novice ne doit jamais avoir besoin d'ouvrir Terminal, Finder dans Application Support, Gradle, Android Studio ou un fichier technique pour comprendre pourquoi une publication ne fonctionne pas.
