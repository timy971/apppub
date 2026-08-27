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
- le vrai installateur `AppPublisher-Setup.exe` de bêta privée réussit réellement sur Windows.

Le workflow `.github/workflows/release-candidate.yml` exécute ces contrôles sur chaque PR du lot 11 et peut aussi être déclenché manuellement.

## 11.2 — Bêta privée installable

La bêta privée ne nécessite ni abonnement Apple Developer, ni Azure Artifact Signing, ni certificat de signature Windows.

### Windows

Le mode `bun run pack:win-beta` produit un véritable installateur NSIS x64 `AppPublisher-Setup.exe` sans exiger de certificat. Windows peut afficher « Éditeur inconnu » ou un avertissement SmartScreen : c'est attendu pour cette phase privée.

Le mode de distribution publique reste distinct : `bun run release:win` exige toujours une signature valide et refuse de produire une release publique dégradée.

### macOS

Le mode `bun run pack:mac-beta` produit deux DMG privés : `AppPublisher-arm64.dmg` pour Apple Silicon et `AppPublisher-x64.dmg` pour Intel. Ils ne sont pas signés/notarisés à ce stade ; Gatekeeper peut donc demander une autorisation locale pendant la bêta privée.

Une distribution publique en DMG/ZIP restera conditionnée à un certificat Developer ID et à la notarisation Apple.

### Ce qui est volontairement reporté

Tant qu'AppPublisher n'est pas destiné à être diffusé publiquement :

- Release macOS signée/notarisée ;
- Release Windows Authenticode / Artifact Signing ;
- publication d'un tag GitHub `v*` ;
- validation de la réputation SmartScreen d'un binaire public.

## 11.3 — Recette « machine neuve »

Le lot 11.3 ne se contente plus d'une checklist. Le workflow `Release candidate` utilise un runner `windows-2025` neuf et exécute réellement `scripts/smoke-win-clean-install.ps1` sur l'installateur produit. Sur macOS, il construit puis monte réellement les deux DMG privés via `hdiutil`.

### OAuth Google Play — parcours utilisateur obligatoire

Le test réel du DMG a révélé une friction bloquante : une build dépourvue de configuration OAuth demandait à l'utilisateur de sélectionner un fichier `client_secret.json`. Ce comportement est désormais interdit pour une build distribuable.

Le fonctionnement cible est :

**Se connecter avec Google → navigateur Google → choix du compte → autorisation → retour dans AppPublisher.**

Pour garantir ce comportement :

- une bêta/distribution doit embarquer le Client ID OAuth Desktop public d'AppPublisher ;
- `scripts/pack.cjs` refuse de produire la build si cette identité manque ;
- le `client_secret` n'est pas requis pour le flux Desktop PKCE utilisé par AppPublisher ;
- le Client ID peut être fourni par `build/google-play-oauth-client.json` ou par `APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID` ;
- `GOOGLE_PLAY_OAUTH_JSON_BASE64` reste uniquement pour compatibilité avec les anciens workflows ;
- le sélecteur manuel OAuth est désactivé pour les utilisateurs normaux et n'est activable qu'en dépannage avec `APPPUBLISHER_ALLOW_OAUTH_FILE_PICKER=1` ;
- une PR CI utilise un Client ID synthétique uniquement pour tester la mécanique de packaging ;
- seuls les lancements manuels avec une vraie identité OAuth peuvent conserver des DMG/EXE destinés à des tests utilisateurs.

### Partie automatisée — Windows

La gate vérifie :

- que `AppPublisher-Setup.exe` est présent et non vide ;
- qu'il est bien non signé en mode bêta privée ;
- qu'il s'installe silencieusement en mode utilisateur ;
- qu'une entrée de désinstallation Windows est créée ;
- que `AppPublisher.exe` et ses métadonnées produit sont valides ;
- qu'un raccourci du menu Démarrer existe ;
- qu'une donnée utilisateur témoin est conservée après désinstallation ;
- que le programme et son entrée de registre disparaissent correctement ;
- qu'une réinstallation réussit ;
- que les données utilisateur sont toujours présentes après réinstallation.

Le rapport `.artifacts/windows-clean-machine-smoke.json` porte le verdict attendu `ready-for-manual-product-journey`. L'installateur de bêta destiné à un utilisateur n'est conservé que lors d'un lancement manuel disposant de la vraie identité OAuth AppPublisher.

### Partie automatisée — macOS

La gate vérifie :

- la création des DMG arm64 et x64 ;
- le montage de chaque DMG ;
- la présence de `AppPublisher.app` et de son exécutable ;
- la présence de `Contents/Resources/google-play-oauth.json` dans l'application empaquetée.

Les DMG destinés à un utilisateur ne sont conservés que lors d'un lancement manuel disposant de la vraie identité OAuth AppPublisher.

### Partie manuelle — parcours produit réel

Après la gate automatisée, il reste une recette réelle à effectuer une fois avec le binaire certifié :

- lancer AppPublisher sans terminal ;
- importer un dépôt GitHub/Lovable de test ;
- lancer le diagnostic système ;
- vérifier la détection du JDK et du SDK Android ;
- si Android Studio a installé le SDK sans `ANDROID_HOME`, vérifier qu'AppPublisher le configure automatiquement ;
- préparer une version, créer/associer la signature Android, générer puis valider l'AAB ;
- cliquer sur **Se connecter avec Google** et vérifier que le navigateur s'ouvre directement, sans sélecteur de fichier ;
- publier sur la piste interne ;
- provoquer volontairement un versionCode trop faible et vérifier la proposition d'un minimum valide ;
- quitter et relancer pour vérifier la conservation du projet et des réglages ;
- vérifier le stockage sécurisé des secrets ;
- générer un journal de support et confirmer l'absence de secrets sensibles.

La procédure détaillée est dans `docs/clean-machine-recipe-v1.md`.

## 11.4 — Critères de sortie bêta privée V1

La bêta privée V1 est autorisée quand :

- Quality gate : verte ;
- Release candidate : verte sur Linux, macOS et Windows ;
- les installateurs réellement distribués embarquent le Client ID OAuth AppPublisher ;
- aucun utilisateur normal n'a besoin de sélectionner un fichier OAuth ;
- la recette Windows machine neuve automatisée est verte avec le verdict `ready-for-manual-product-journey` ;
- au moins un parcours complet réel AppPublisher → AAB → Google Play interne est réussi ;
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
