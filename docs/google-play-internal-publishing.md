# Publication Google Play — piste interne

Le lot 6 ajoute un envoi réel via la Google Play Developer API v3. Le périmètre est volontairement
limité à la piste `internal` : aucune méthode du bridge ne permet de sélectionner `alpha`, `beta` ou
`production`.

## Préparation du compte Google

Avant la première connexion dans AppPublisher :

1. créer la fiche de l'application dans Google Play Console avec le même identifiant Android ;
2. activer la Google Play Developer API dans un projet Google Cloud ;
3. créer un compte de service et télécharger sa clé JSON ;
4. inviter l'adresse du compte de service dans **Utilisateurs et autorisations** de Play Console ;
5. lui accorder uniquement les droits nécessaires à la gestion des releases de l'application.

Références officielles :

- https://developers.google.com/android-publisher/getting_started
- https://developers.google.com/android-publisher/api-ref/rest/v3/edits

AppPublisher copie la clé dans le trousseau macOS. Il ne modifie et ne supprime pas le fichier JSON
d'origine : l'utilisateur reste responsable de sa conservation ou de sa suppression sécurisée.

## Parcours utilisateur

1. construire et préparer une release avec un AAB signé et des notes de version ;
2. cliquer sur **Connecter Google Play** et choisir la clé JSON ;
3. cliquer sur **Vérifier l'accès** ; AppPublisher crée puis supprime immédiatement une édition de
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
- la clé du compte de service est prise en charge uniquement sur macOS tant que les coffres Windows
  et Linux ne sont pas implémentés ;
- les pistes fermée, ouverte et production ne sont pas exposées ;
- les tests automatisés utilisent une API simulée et ne téléversent aucune application réelle.
