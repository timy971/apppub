# Lot 11.2 — Signature Windows avec Azure Artifact Signing

## Choix retenu

AppPublisher utilise Azure Artifact Signing en mode Public Trust pour la distribution Windows officielle.

- Offre : Basic.
- Région recommandée : West Europe.
- Endpoint : `https://weu.codesigning.azure.net`.
- Le profil doit être de type `PublicTrust`, pas `PublicTrustTest`.
- La validation d'identité doit correspondre à une organisation éligible à la confiance publique.

Le certificat et son cycle de vie restent gérés par Microsoft : aucune clé privée PFX n'est stockée dans GitHub lorsque ce mode est utilisé.

## Ressources Azure à créer

1. Un abonnement Azure avec facturation active.
2. Un groupe de ressources dédié à AppPublisher.
3. Un compte Azure Artifact Signing en SKU Basic, région West Europe.
4. Une validation d'identité Public Trust approuvée pour l'organisation éditrice.
5. Un profil de certificat Public Trust, par exemple `AppPublisher`.
6. Une application Microsoft Entra / principal de service dédiée à GitHub Actions.
7. Le rôle `Artifact Signing Certificate Profile Signer` attribué à ce principal de service sur le profil AppPublisher uniquement.

## Secrets GitHub attendus

Dans `Settings > Secrets and variables > Actions`, créer :

- `GOOGLE_PLAY_OAUTH_JSON_BASE64` : JSON du client OAuth Google Play Desktop encodé en base64.
- `WINDOWS_AZURE_PUBLISHER_NAME` : nom d'éditeur exactement tel qu'il apparaît dans le certificat Public Trust.
- `WINDOWS_AZURE_ENDPOINT` : `https://weu.codesigning.azure.net` si le compte est en West Europe.
- `WINDOWS_AZURE_CERTIFICATE_PROFILE` : nom du profil de certificat, par exemple `AppPublisher`.
- `WINDOWS_AZURE_SIGNING_ACCOUNT` : nom du compte Artifact Signing.
- `AZURE_TENANT_ID` : tenant Microsoft Entra.
- `AZURE_CLIENT_ID` : application / principal de service utilisé par GitHub Actions.
- `AZURE_CLIENT_SECRET` : secret client de cette application.

Ne pas créer `WINDOWS_CERTIFICATE_PFX_BASE64` ni `WINDOWS_CERTIFICATE_PASSWORD` lorsque le mode Azure est utilisé.

## Validation AppPublisher

Le workflow `Release Windows` :

1. recertifie les sources et le parcours novice ;
2. vérifie uniquement la présence des paramètres nécessaires sans afficher leur valeur ;
3. embarque le client OAuth Google Play ;
4. construit `AppPublisher-Setup.exe` ;
5. signe les binaires avec Azure Artifact Signing ;
6. vérifie la signature Authenticode ;
7. teste l'installation/désinstallation de l'installateur ;
8. vérifie `latest.yml` et le blockmap ;
9. conserve les artefacts pour la recette.

Un lancement manuel ne publie pas de release GitHub publique. La publication officielle reste réservée à un tag `v*` après validation du lot 11.
