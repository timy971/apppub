# Finition pré-distribution

## Objectif

Figer l'expérience utilisateur avant le Lot 13 sans ajouter de nouvelle fonctionnalité métier.

Le lot traite trois points :

1. supprimer les vestiges temporaires de l'onboarding ;
2. alléger le mode Découverte pour ne montrer que ce qui est réellement disponible ;
3. exiger deux validations terrain avant de considérer l'expérience prête à distribuer.

## Corrections UX

### Onboarding

Le focus automatique des champs reste volontairement désactivé : un ancien comportement Electron/React pouvait provoquer un freeze du renderer.

Le comportement final est désormais explicite et stable :

- à chaque changement d'étape, le titre reçoit le focus après le rendu ;
- Tab permet d'atteindre les champs et boutons ;
- Entrée reste utilisable dans les champs prévus ;
- aucun commentaire ou code de diagnostic temporaire ne subsiste.

### Fonctions à venir

En mode **Découverte**, la plateforme Apple n'apparaît plus dans la navigation principale.

Elle reste disponible dans les modes Assistant / Expert afin de conserver l'architecture multi-plateforme sans polluer le parcours novice.

Le réglage de langue n'affiche plus « English (bientôt) ». La version actuelle annonce simplement qu'elle est disponible en français.

## Validation terrain

Un écran **Paramètres → Validation avant distribution** affiche deux preuves.

### 1. Test avec un vrai novice

La preuve est validée uniquement si :

- une session du Lot 16 est terminée ;
- une publication Google Play réelle a été détectée pendant cette session.

Il n'existe aucun bouton permettant de forcer l'état.

### 2. Promotion réelle vers le test fermé

La preuve est validée uniquement si l'historique AppPublisher contient une publication Google Play réussie sur la piste `alpha`.

Le test recommandé :

1. choisir une application déjà présente sur la piste interne ;
2. ouvrir **Publier sur Google Play** ;
3. actualiser le cycle de diffusion ;
4. promouvoir la version vers **Test fermé** ;
5. vérifier dans Play Console que la release apparaît bien sur la piste fermée ;
6. revenir dans AppPublisher et actualiser ;
7. ouvrir **Validation avant distribution**.

## Critère de sortie

Le lot est considéré fonctionnellement terminé lorsque :

- le Quality Gate est vert ;
- l'écran de validation affiche **2 / 2 validées** après les deux tests terrain.

Le Lot 13 peut techniquement être développé avant ces deux preuves, mais la recommandation produit est de ne pas figer une distribution publique avant de les avoir obtenues.
