# Publication Google Play — piste interne

Le lot 6 ajoute un envoi réel via la Google Play Developer API v3. Le périmètre est volontairement
limité à la piste `internal` : aucune méthode du bridge ne permet de sélectionner `alpha`, `beta` ou
`production`.

## Connexion recommandée : OAuth utilisateur

Le parcours normal ne demande **aucun fichier** à l'utilisateur. Il clique sur **Se connecter avec
Google**, choisit le compte autorisé dans Play Console dans son navigateur, puis revient
automatiquement dans AppPublisher. Le jeton de renouvellement est conservé dans le stockage
sécurisé du système ; aucun mot de passe Google n'entre dans l'interface.

AppPublisher utilise un client OAuth de type **Application de bureau**, une redirection loopback sur
`127.0.0.1`, un `state` aléatoire et PKCE. Pour une application installée, le Client ID identifie
l'application et le `client_secret` n'est pas requis par le flux utilisé ici.

### Configuration du produit AppPublisher

Cette configuration appartient au **build AppPublisher**, pas à chaque utilisateur.

Le Client ID Desktop public officiel d'AppPublisher est versionné dans
`build/google-play-oauth-client.json`. Aucun `client_secret` n'est versionné.

Au packaging :

1. `scripts/google-oauth-build-config.cjs` lit ce Client ID public et génère la ressource normalisée
   `build/google-play-oauth.json` ;
2. `scripts/pack.cjs` refuse toute bêta/distribution si aucune identité OAuth valide n'est disponible ;
3. `electron-builder` copie cette configuration dans les ressources de l'application ;
4. la Release Candidate compare l'identité empaquetée avec le Client ID versionné et, sur macOS,
   monte les DMG pour vérifier la ressource directement dans `AppPublisher.app`.

`APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID` peut toujours surcharger le Client ID au packaging pour un cas
contrôlé. `GOOGLE_PLAY_OAUTH_JSON_BASE64` reste accepté uniquement pour compatibilité avec les anciens
workflows.

Le sélecteur manuel de fichier OAuth n'est **pas** un parcours utilisateur. Il n'est activable que
pour le développement ou le dépannage avec `APPPUBLISHER_ALLOW_OAUTH_FILE_PICKER=1`.

Le compte choisi reste limité aux droits qui lui ont été accordés dans **Utilisateurs et
autorisations** de Play Console.

Référence Google pour les applications Desktop :
https://developers.google.com/identity/protocols/oauth2/native-app

## Option avancée : compte de service

Avant le premier import JSON :

1. créer la fiche de l'application dans Google Play Console avec le même identifiant Android ;
2. activer la Google Play Developer API dans un projet Google Cloud ;
3. créer un compte de service et télécharger sa clé JSON ;
4. inviter l'adresse du compte de service dans **Utilisateurs et autorisations** de Play Console ;
5. lui accorder uniquement les droits nécessaires à la gestion des releases de l'application.

Références officielles :

- https://developers.google.com/android-publisher/getting_started
- https://developers.google.com/android-publisher/api-ref/rest/v3/edits

Sous **Options avancées**, AppPublisher copie la clé dans le stockage sécurisé du système. Il ne
modifie et ne supprime pas le fichier JSON d'origine : l'utilisateur reste responsable de sa
conservation ou de sa suppression sécurisée.

## Parcours utilisateur

1. construire et préparer une release avec un AAB signé et des notes de version ;
2. cliquer sur **Se connecter avec Google** et terminer l'autorisation dans le navigateur ;
3. la connexion OAuth vérifie immédiatement l'accès. Les connexions existantes peuvent aussi être
   contrôlées avec **Vérifier l'accès** ; AppPublisher crée puis supprime immédiatement une édition de
   contrôle afin de vérifier l'existence de l'application et les droits du compte ;
4. cliquer sur **Publier sur internal** ;
5. confirmer dans la boîte de dialogue native qui rappelle l'application, la version, le compte et
   la piste ciblée.

## Transaction API

L'envoi suit cette séquence :

1. `edits.insert` ;
2. `edits.bundles.upload` ;
3. `edits.tracks.update` sur `internal`, avec le statut `completed` ;
4. `edits.validate` ;
5. `edits.commit` avec `changesInReviewBehavior=ERROR_IF_IN_REVIEW`.

Si une étape échoue avant le commit, AppPublisher appelle `edits.delete`. Le mode
`ERROR_IF_IN_REVIEW` empêche une nouvelle publication d'annuler silencieusement une revue Google
Play déjà en cours.

## Limites explicites

- l'application doit déjà exister dans Play Console ;
- les déclarations de contenu, de confidentialité et réglementaires restent à compléter dans Play
  Console ;
- les pistes fermée, ouverte et production ne sont pas exposées ;
- les tests automatisés utilisent une API simulée et ne téléversent aucune application réelle.
