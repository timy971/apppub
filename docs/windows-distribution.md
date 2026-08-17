# Lot 9.1 — installer AppPublisher simplement sur Windows

Ce parcours produit un installateur **Windows 10/11 x64** en un clic, signé,
testé sur un runner Windows propre puis publié dans GitHub Releases. Il rend
aussi fonctionnels sur Windows le stockage sécurisé des mots de passe Android,
la connexion Google Play et les mises à jour automatiques.

## Pour l'utilisateur : deux gestes

Le lien public ne change jamais :

**[Télécharger AppPublisher pour Windows](https://github.com/timy971/apppub/releases/latest/download/AppPublisher-Setup.exe)**

1. Ouvrez `AppPublisher-Setup.exe`.
2. Attendez quelques secondes : AppPublisher s'installe et s'ouvre.

L'installation est faite pour le compte Windows courant. Elle ne demande ni
Terminal, ni dossier de destination, ni droits administrateur dans le cas
normal. Un raccourci est ajouté au menu Démarrer, sans encombrer le Bureau.

## Prérequis : certificat de signature Windows

Une version grand public doit être signée au nom de **TC Capital**. Sans
signature, Windows SmartScreen peut afficher un avertissement inquiétant, même
si le fichier est sain.

Le pipeline accepte deux solutions :

- **Microsoft Trusted Signing**, conseillé lorsqu'il est disponible pour
  l'entreprise : la clé reste chez Microsoft et GitHub Actions demande chaque
  signature à distance ;
- un certificat de signature exportable au format `.pfx` compatible avec
  GitHub Actions.

Certains certificats sont fournis uniquement sur une clé matérielle et ne sont
pas exportables. Il ne faut donc pas acheter un certificat avant d'avoir
confirmé son mode d'utilisation avec GitHub Actions.

Ne placez jamais le certificat, son mot de passe ou le client OAuth Google dans
le dépôt. Ils vont uniquement dans les secrets GitHub.

## Ajouter les secrets dans GitHub

Ouvrez **Settings → Secrets and variables → Actions → New repository secret**
et créez toujours :

| Secret                          | Valeur                                  |
| ------------------------------- | --------------------------------------- |
| `GOOGLE_PLAY_OAUTH_JSON_BASE64` | client OAuth Google de bureau en Base64 |

Pour un certificat PFX, ajoutez :

| Secret                           | Valeur                              |
| -------------------------------- | ----------------------------------- |
| `WINDOWS_CERTIFICATE_PFX_BASE64` | contenu Base64 du certificat `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD`   | mot de passe du certificat          |

Pour Microsoft Trusted Signing, ajoutez :

| Secret                              | Valeur                                      |
| ----------------------------------- | ------------------------------------------- |
| `WINDOWS_AZURE_PUBLISHER_NAME`      | nom exact de l'éditeur vérifié              |
| `WINDOWS_AZURE_ENDPOINT`            | point de terminaison du compte de signature |
| `WINDOWS_AZURE_CERTIFICATE_PROFILE` | nom du profil de certificat                 |
| `WINDOWS_AZURE_SIGNING_ACCOUNT`     | nom du compte de signature                  |
| `AZURE_TENANT_ID`                   | identifiant du tenant Microsoft Entra       |
| `AZURE_CLIENT_ID`                   | identifiant de l'application Entra          |
| `AZURE_CLIENT_SECRET`               | secret de l'application Entra               |

Depuis PowerShell, le certificat peut être encodé ainsi :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AppPublisher-signing.pfx")) | Set-Clipboard
```

Le jeton GitHub de publication est fourni automatiquement.

## Vérifier sans publier

Dans **GitHub → Actions → Release Windows → Run workflow**, lancez le workflow
manuellement. Il :

1. exécute les tests, le typage et le lint avec npm ;
2. construit l'application et l'installateur x64 ;
3. vérifie les signatures Authenticode de l'application et de l'installateur ;
4. réalise une installation puis une désinstallation silencieuses ;
5. contrôle le client Google et le manifeste de mise à jour ;
6. conserve les artefacts et un rapport sans secret, sans créer de release.

## Publier une version

1. Mettez à jour `version.json`, par exemple vers `1.1.0`.
2. Fusionnez la modification sur `main`.
3. Créez et poussez le tag correspondant :

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. Le workflow Windows certifie puis ajoute à la release :
   `AppPublisher-Setup.exe`, son blockmap, `latest.yml` et le rapport.

Les workflows Windows et macOS peuvent compléter la même release sans
écraser les fichiers de l'autre plateforme.

## Validation finale sur un PC propre

Le lot est pleinement validé après ce test sur un PC Windows 10 ou 11 où
AppPublisher n'a jamais été installé :

1. téléchargez l'EXE avec le lien permanent ;
2. ouvrez-le normalement et confirmez qu'aucun avertissement SmartScreen ne
   bloque l'installation ;
3. connectez Google Play, fermez puis rouvrez AppPublisher ;
4. créez ou importez un profil de signature Android et réalisez un AAB signé ;
5. publiez une version N+1 puis choisissez **Aide → Rechercher des mises à
   jour…** ;
6. vérifiez que les projets et profils sont conservés après la mise à jour.

La réputation SmartScreen ne peut pas être simulée par un test automatisé. Si
Windows affiche encore un avertissement malgré une signature valide, il faut
faire vérifier le type de certificat et sa réputation avant de communiquer le
lien au grand public.

## Compilation locale avancée

Sur Windows, `npm run pack:win` produit une application locale non destinée au
public. `npm run release:win` construit et certifie l'installateur sans le
publier. `npm run release:win:publish` exige en plus un tag correspondant à la
version et un jeton GitHub.
