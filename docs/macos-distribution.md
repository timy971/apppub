# Lot 7 — distribuer AppPublisher sur macOS

Ce parcours produit un installateur **DMG universel** (Mac Apple Silicon et
Intel), signé avec Developer ID, contrôlé par Apple, puis publié dans les
Releases GitHub. AppPublisher pourra ensuite proposer les nouvelles versions
depuis son menu **AppPublisher → Rechercher des mises à jour…**.

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
3. Ouvrez **GitHub → Actions → Release macOS → Run workflow**.
4. Attendez que toutes les étapes soient vertes.
5. Ouvrez **GitHub → Releases** : le DMG, le ZIP et `latest-mac.yml` doivent
   être attachés à la version.

Le workflow s'arrête avant publication si le client Google, le certificat ou
les justificatifs Apple manquent. La valeur des secrets n'est jamais écrite
dans les journaux.

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

Pour une vérification technique complémentaire sur le Mac de compilation :

```bash
codesign --verify --deep --strict --verbose=2 "/Applications/AppPublisher.app"
spctl --assess --type execute --verbose=2 "/Applications/AppPublisher.app"
xcrun stapler validate "/Applications/AppPublisher.app"
```

Le lot 7 est validé seulement lorsque l'installation Gatekeeper **et** le
passage réel d'une version N à N+1 ont réussi sur ce Mac propre.

## Compilation locale avancée

`npm run pack:mac` conserve le mode de développement actuel et produit une
`.app` arm64 non signée. Pour simuler la distribution sans la publier :

```bash
npm run release:mac
```

Cette commande exige volontairement le client OAuth, le certificat Developer
ID et les justificatifs de notarisation. Pour publier sur GitHub, utilisez
`npm run release:mac:publish` avec un `GH_TOKEN` disponible.
