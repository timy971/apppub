# Lot 11 — Release Candidate / bêta V1

## Objectif

Le lot 11 ne cherche pas à ajouter de nouvelles fonctions. Il transforme la version actuellement validée d'AppPublisher en candidate reproductible et testable sur une machine propre.

À ce stade, AppPublisher est destiné à une **bêta privée** : la signature commerciale macOS/Windows n'est donc pas un prérequis. Les garde-fous de distribution publique restent cependant présents dans le code afin qu'une future diffusion ne puisse pas produire accidentellement un binaire non signé.

Référence de départ : branche `agent/lot-10-premiere-publication-google-play`, après les correctifs de parcours, de versionCode Google Play et de détection/configuration automatique du SDK Android.

## 11.1 — Gel et certification automatique

Une candidate est acceptable seulement si :

- `package.json` et `version.json` portent la même version ;
- les ressources Electron, macOS et Windows nécessaires sont présentes ;
- la future distribution publique macOS reste configurée en DMG + ZIP universels, signée et notarisée ;
- la future distribution publique Windows reste configurée en NSIS x64 avec signature obligatoire ;
- la bêta privée Windows peut produire le même installateur NSIS x64 sans certificat payant ;
- la Quality gate conserve la construction de deux AAB signés consécutifs ;
- les workflows officiels macOS et Windows installent les dépendances depuis `bun.lock` avec `bun install --frozen-lockfile` ;
- tests, certification UX, TypeScript, lint et build Electron passent ;
- les DMG privés macOS arm64/x64 sont réellement créés et montables ;
- le vrai installateur `AppPublisher-Setup.exe` de bêta privée réussit réellement sur Windows ;
- bundletool 1.18.2 est préparé avec son SHA-256 certifié puis réellement embarqué dans les applications distribuées.

## 11.2 — Bêta privée installable

La bêta privée ne nécessite ni abonnement Apple Developer, ni Azure Artifact Signing, ni certificat de signature Windows.

### Windows

Le mode `bun run pack:win-beta` produit un véritable installateur NSIS x64 `AppPublisher-Setup.exe` sans exiger de certificat. Windows peut afficher « Éditeur inconnu » ou un avertissement SmartScreen : c'est attendu pour cette phase privée.

Le mode de distribution publique reste distinct : `bun run release:win` exige toujours une signature valide et refuse de produire une release publique dégradée.

### macOS

Le mode `bun run pack:mac-beta` produit deux DMG privés : `AppPublisher-arm64.dmg` pour Apple Silicon et `AppPublisher-x64.dmg` pour Intel. Ils ne sont pas signés/notarisés à ce stade ; Gatekeeper peut donc demander une autorisation locale pendant la bêta privée.

Une distribution publique en DMG/ZIP restera conditionnée à un certificat Developer ID et à la notarisation Apple.

## 11.3 — Recette « machine neuve »

Le lot 11.3 ne se contente plus d'une checklist. Le workflow `Release candidate` utilise un runner `windows-2025` neuf et exécute réellement `scripts/smoke-win-clean-install.ps1` sur l'installateur produit. Sur macOS, il construit puis monte réellement les deux DMG privés via `hdiutil`.

### OAuth Google Play — parcours utilisateur obligatoire

Les tests réels ont montré successivement qu'une build sans configuration OAuth demandait un fichier technique, puis que le serveur Google du client Desktop AppPublisher refusait l'échange du code sans son `client_secret`. Le parcours utilisateur normal reste néanmoins totalement transparent :

**Se connecter avec Google → navigateur Google → choix du compte → autorisation → retour dans AppPublisher.**

Pour garantir ce comportement :

- le Client ID OAuth Desktop public d'AppPublisher est versionné seul dans `build/google-play-oauth-client.json` ;
- le Client secret n'est jamais versionné ; il est injecté uniquement au packaging depuis `GOOGLE_PLAY_OAUTH_CLIENT_SECRET` ;
- `scripts/pack.cjs` refuse de produire une build distribuable si le Client secret requis par le client Google réel manque ;
- le sélecteur manuel OAuth est désactivé pour les utilisateurs normaux et n'est activable qu'en dépannage avec `APPPUBLISHER_ALLOW_OAUTH_FILE_PICKER=1` ;
- la CI de PR utilise une valeur synthétique uniquement pour vérifier le câblage ;
- une bêta utilisateur réelle utilise le secret GitHub et vérifie la présence de la paire OAuth dans le binaire ;
- sur macOS, la CI monte chaque DMG et vérifie la configuration dans `Contents/Resources/google-play-oauth.json`.

### Identité Android Google Play

Le parcours réel a aussi révélé qu'un ancien projet pouvait transmettre un nom npm tel que `vite_react_shadcn_ts` au lieu du package Android réel. Le résolveur Google Play utilise désormais en priorité l'identité validée de l'AAB/Capacitor et refuse les noms non conformes. Pour CrânioScan, l'identité attendue est `app.cranioscan.android`.

### bundletool — validation AAB officielle intégrée

Le rapport réel CrânioScan du 27 août 2026 était correct sur l'identité, la version et la signature, mais restait en verdict `warnings` car bundletool n'était pas disponible sur le Mac utilisateur.

Le correctif permanent est le suivant :

- AppPublisher utilise **bundletool 1.18.2** ;
- `scripts/ensure-bundletool.cjs` télécharge l'artefact officiel uniquement au moment du build et vérifie obligatoirement son SHA-256 `378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584` ;
- le JAR téléchargé n'est pas versionné dans Git ;
- `electron-builder` l'embarque dans `Resources/tools/bundletool.jar` ;
- le moteur de validation AAB recherche déjà automatiquement cet emplacement et lance `java -jar bundletool.jar validate --bundle=...` ;
- la Quality gate Android utilise exactement le même script et le même JAR que la build utilisateur ;
- la RC monte les DMG et compare le checksum du JAR réellement empaqueté ;
- la recette Windows vérifie le JAR et son checksum après installation puis après réinstallation.

Ainsi, un utilisateur normal n'a plus à installer bundletool lui-même. Si l'AAB est conforme, le rapport AppPublisher doit présenter `bundletool.status: "passed"` et le verdict `ready`, et non plus l'avertissement `bundletool-unavailable`.

### Partie automatisée — Windows

La gate vérifie notamment :

- que `AppPublisher-Setup.exe` est présent et non vide ;
- qu'il est bien non signé en mode bêta privée ;
- qu'il s'installe silencieusement en mode utilisateur ;
- qu'une entrée de désinstallation Windows est créée ;
- que `AppPublisher.exe` et ses métadonnées produit sont valides ;
- que `resources/tools/bundletool.jar` est présent avec le SHA-256 certifié ;
- qu'un raccourci du menu Démarrer existe ;
- que les données utilisateur sont conservées après désinstallation ;
- qu'une réinstallation réussit et conserve à nouveau bundletool et les données utilisateur.

### Partie automatisée — macOS

La gate vérifie notamment :

- la création des DMG arm64 et x64 ;
- le montage de chaque DMG ;
- la présence de `AppPublisher.app` et de son exécutable ;
- la configuration OAuth embarquée ;
- `Contents/Resources/tools/bundletool.jar` ;
- le SHA-256 exact de bundletool dans chacun des deux DMG.

### Partie manuelle — parcours produit réel

La recette réelle doit confirmer :

- lancement d'AppPublisher sans terminal ;
- import GitHub/Lovable ;
- détection du JDK et du SDK Android ;
- génération et signature de l'AAB ;
- validation AAB avec bundletool intégré et verdict `ready` ;
- connexion Google sans sélection de fichier ;
- identité Google Play correcte ;
- publication sur la piste interne ;
- comportement versionCode trop faible ;
- persistance après relance ;
- journal de support sans secret sensible.

## 11.4 — Critères de sortie bêta privée V1

La bêta privée V1 est autorisée quand :

- Quality gate : verte ;
- Release candidate : verte sur Linux, macOS et Windows ;
- les installateurs réellement distribués embarquent la configuration OAuth requise et bundletool certifié ;
- aucun utilisateur normal n'a besoin de sélectionner un fichier OAuth ni d'installer bundletool ;
- la recette Windows machine neuve automatisée est verte ;
- au moins un parcours complet réel AppPublisher → AAB → Google Play interne est réussi ;
- le rapport AAB réel ne contient plus `bundletool-unavailable` ;
- aucun défaut bloquant ou critique n'est ouvert ;
- les journaux de support ne contiennent ni mot de passe, ni clé privée, ni jeton OAuth.

La signature/notarisation n'est **pas** un critère de sortie de bêta privée.

## 11.5 — Critères supplémentaires avant diffusion publique

Avant de proposer AppPublisher à des utilisateurs externes, il faudra en plus :

- Release macOS signée et notarisée, si macOS est distribué ;
- Release Windows signée Authenticode / Artifact Signing ;
- configuration Google Auth Platform adaptée aux utilisateurs externes et, si nécessaire pour les scopes demandés, validation Google ;
- recette machine neuve sur chaque OS distribué ;
- vérification des manifests d'auto-update ;
- publication contrôlée via tag/release GitHub ;
- aucun avertissement de sécurité inattendu lié au packaging lui-même.

## Règle pendant le lot 11

Aucune grosse fonction produit n'entre dans la candidate. Une modification est acceptée uniquement si elle corrige un défaut de fiabilité, d'installation, de sécurité, de compréhension du parcours ou de distribution.
