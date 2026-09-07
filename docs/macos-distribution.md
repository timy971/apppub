# Lot 9 — installer AppPublisher simplement sur macOS

Ce parcours produit un installateur **DMG universel** (Mac Apple Silicon et
Intel), signé avec Developer ID, contrôlé par Apple, puis publié dans les
Releases GitHub. AppPublisher pourra ensuite proposer les nouvelles versions
depuis son menu **AppPublisher → Rechercher des mises à jour…**.

## Pour l'utilisateur : trois gestes

Le lien public ne change jamais :

**[Télécharger AppPublisher pour Mac](https://github.com/timy971/apppub/releases/latest/download/AppPublisher.dmg)**

1. Ouvrez `AppPublisher.dmg`.
2. Glissez AppPublisher dans **Applications**.
3. Ouvrez AppPublisher depuis **Applications**.

Le DMG est universel : l'utilisateur ne choisit ni « Intel », ni « Apple
Silicon ». Une version officielle ne demande jamais de Terminal, de clic droit
ou de contournement dans les réglages de sécurité.

> Prérequis actuel : TC Capital doit être inscrite à l'Apple Developer Program.
> Tant que le certificat Developer ID et les identifiants de notarisation ne
> sont pas disponibles, le pipeline s'arrête volontairement et aucune version
> non signée n'est présentée comme un téléchargement officiel.

> Ne placez jamais un certificat, un mot de passe, une clé Apple ou le client
> OAuth Google dans le dépôt, une issue ou une conversation. Ils vont
> uniquement dans les secrets GitHub du dépôt.

## 1. Ce qu'il faut préparer une seule fois

### A. Certificat Developer ID Application

1. Ouvrez **Xcode → Settings → Accounts** et ajoutez votre compte Apple.
2. Sélectionnez votre équipe, puis **Manage Certificates…**.
3. Cliquez sur **+ → Developer ID Application**.
4. Dans **Trousseaux d'accès**, exportez le certificat **avec sa clé privée**
   au format `.p12` et choisissez un mot de passe fort.
5. Convertissez le fichier en Base64 sans modifier l'original :

   ```bash
   base64 -i AppPublisher-Developer-ID.p12 | pbcopy
   ```

### B. Clé API App Store Connect pour la notarisation

1. Dans App Store Connect, ouvrez **Utilisateurs et accès → Intégrations →
   Clés API App Store Connect**.
2. Créez une clé adaptée à la notarisation et téléchargez le fichier `.p8`.
   Apple ne permet généralement de le télécharger qu'une fois.
3. Notez l'**ID de clé**, l'**ID d'émetteur** et votre **Team ID** Apple.
4. Copiez le contenu encodé de la clé :

   ```bash
   base64 -i AuthKey_VOTRE_ID.p8 | pbcopy
   ```

### C. Client OAuth Google déjà créé

Encodez le fichier `google-play-oauth.json` de type **Application de bureau** :

```bash
base64 -i build/google-play-oauth.json | pbcopy
```

Ce fichier est intégré au paquet pendant la compilation, puis supprimé avec le
runner GitHub temporaire.

## 2. Ajouter les secrets dans GitHub

Ouvrez le dépôt GitHub, puis **Settings → Secrets and variables → Actions →
New repository secret**. Créez exactement ces secrets :

| Secret                          | Valeur                                      |
| ------------------------------- | ------------------------------------------- |
| `MAC_CERTIFICATE_P12_BASE64`    | contenu Base64 du `.p12`                    |
| `MAC_CERTIFICATE_PASSWORD`      | mot de passe choisi lors de l'export `.p12` |
| `APPLE_API_KEY_BASE64`          | contenu Base64 du fichier `.p8`             |
| `APPLE_API_KEY_ID`              | ID de la clé API                            |
| `APPLE_API_ISSUER`              | ID d'émetteur App Store Connect             |
| `APPLE_TEAM_ID`                 | Team ID Apple (10 caractères)               |
| `GOOGLE_PLAY_OAUTH_JSON_BASE64` | contenu Base64 du client OAuth Google       |

Le jeton GitHub de publication est fourni automatiquement au workflow : aucun
Personal Access Token n'est nécessaire.

## 3. Publier une version

1. Mettez à jour `version.json` avec un numéro jamais publié, par exemple
   `1.1.0`.
2. Faites fusionner cette modification sur `main`.
3. Créez et poussez le tag correspondant exactement à la version :

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. Le workflow construit, signe, notarise et **certifie** le paquet avant de
   créer la release GitHub.
5. Ouvrez **GitHub → Releases** : `AppPublisher.dmg`, `AppPublisher.zip`,
   `latest-mac.yml` et le rapport de certification doivent être présents.

Le bouton manuel **Run workflow** construit et certifie les fichiers, mais ne
les publie pas. Cela permet de vérifier la configuration sans créer de fausse
version publique.

Le workflow s'arrête avant publication si le client Google, le certificat ou
les justificatifs Apple manquent. Il refuse également un tag différent de la
version, une architecture absente, un rejet Gatekeeper, une notarisation
invalide ou un manifeste de mise à jour incomplet. La valeur des secrets n'est
jamais écrite dans les journaux.

## 4. Validation obligatoire sur un Mac propre

Utilisez un Mac où AppPublisher n'a jamais été installé :

1. Téléchargez le DMG depuis la Release GitHub.
2. Glissez AppPublisher dans **Applications**.
3. Ouvrez l'application normalement, sans clic droit ni contournement
   Gatekeeper. macOS ne doit afficher aucun message « développeur non identifié ».
4. Vérifiez que **Se connecter avec Google** ouvre le navigateur puis revient
   correctement dans AppPublisher.
5. Publiez ensuite une version supérieure et utilisez **AppPublisher →
   Rechercher des mises à jour…** dans l'ancienne version.
6. Acceptez le téléchargement puis **Redémarrer et installer**. La nouvelle
   version doit s'ouvrir et les projets enregistrés doivent être conservés.

Ces contrôles techniques sont maintenant exécutés automatiquement :

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/AppPublisher.app"
spctl --assess --type execute --verbose=2 "/Applications/AppPublisher.app"
xcrun stapler validate "/Applications/AppPublisher.app"
```

Le lot 9 est validé seulement lorsque l'installation Gatekeeper **et** le
passage réel d'une version N à N+1 ont réussi sur ce Mac propre.

## Compilation locale avancée

`npm run pack:mac` conserve le mode de développement actuel et produit une
`.app` arm64 non signée. Pour simuler la distribution sans la publier :

```bash
npm run release:mac
```

Cette commande exige volontairement le client OAuth, le certificat Developer
ID et les justificatifs de notarisation. Elle produit aussi le rapport
`.artifacts/macos-release-verification.json`. Pour publier depuis un tag Git,
utilisez `npm run release:mac:publish` avec un `GH_TOKEN` disponible.
