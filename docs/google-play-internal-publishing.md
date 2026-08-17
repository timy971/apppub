# Publication Google Play — piste interne

Le lot 6 ajoute un envoi réel via la Google Play Developer API v3. Le périmètre est volontairement
limité à la piste `internal` : aucune méthode du bridge ne permet de sélectionner `alpha`, `beta` ou
`production`.

## Connexion recommandée : OAuth utilisateur

L'utilisateur clique sur **Se connecter avec Google**, choisit le compte autorisé dans Play Console
dans son navigateur, puis revient automatiquement dans AppPublisher. Le jeton de renouvellement est
conservé dans le stockage sécurisé de macOS ou Windows ; aucun mot de passe Google n'entre dans l'interface.

Pour activer ce bouton dans une compilation AppPublisher :

1. créer un client OAuth de type **Application de bureau** dans le projet Google Cloud qui porte la
   Google Play Developer API ;
2. copier `build/google-play-oauth.example.json` vers `build/google-play-oauth.json` ;
3. renseigner le `client_id` et le `client_secret` téléchargés depuis Google Cloud ;
4. empaqueter AppPublisher. Ce fichier local est ignoré par Git et ajouté aux ressources de
   l'application au packaging ;
5. pendant le développement, il est aussi possible de fournir
   `APPPUBLISHER_GOOGLE_OAUTH_CLIENT_ID` et `APPPUBLISHER_GOOGLE_OAUTH_CLIENT_SECRET`.

La redirection OAuth utilise uniquement une adresse éphémère sur `127.0.0.1`, un paramètre `state`
aléatoire et PKCE. Le compte choisi reste limité aux droits qui lui ont été accordés dans
**Utilisateurs et autorisations** de Play Console.

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

Sous **Options avancées**, AppPublisher copie la clé dans le stockage sécurisé du système. Il ne modifie et ne
supprime pas le fichier JSON d'origine : l'utilisateur reste responsable de sa conservation ou de
sa suppression sécurisée.

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
- les autorisations OAuth et les clés de compte de service sont prises en charge uniquement sur
  macOS tant que les coffres Windows et Linux ne sont pas implémentés ;
- les pistes fermée, ouverte et production ne sont pas exposées ;
- les tests automatisés utilisent une API simulée et ne téléversent aucune application réelle.
