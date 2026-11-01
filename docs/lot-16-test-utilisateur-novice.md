# Lot 16 — Test utilisateur novice réel

## Objectif

Prouver qu'une personne qui ne connaît ni Git, ni Gradle, ni Capacitor, ni Android Studio peut aller jusqu'à une publication Google Play réelle sans assistance technique.

Le Lot 16 n'ajoute pas de fonctionnalité de publication. Il mesure la compréhension du produit existant.

## Protocole

1. utiliser de préférence un Mac ou un profil utilisateur qui n'a pas servi au développement d'AppPublisher ;
2. ouvrir **Paramètres → Test utilisateur novice** ;
3. démarrer une session avec un prénom ou pseudonyme ;
4. laisser le testeur agir seul ;
5. ne répondre à aucune question avant qu'il ait utilisé **Je ne comprends pas** ou **Je suis bloqué** ;
6. terminer la session lorsqu'il estime avoir fini ou qu'il ne peut plus avancer ;
7. copier le rapport généré.

Le démarrage d'une session :

- force temporairement le mode **Découverte** ;
- relance l'onboarding ;
- ne supprime aucun projet, historique ou profil de signature ;
- mémorise les réglages d'origine pour les restaurer à la fin.

## Mesures

AppPublisher conserve localement :

- les écrans visités ;
- les clics **Je ne comprends pas** ;
- les clics **Je suis bloqué** ;
- la durée de la session ;
- l'existence ou non d'une publication Google Play réelle effectuée après le début du test.

Une publication antérieure au test ne peut jamais valider la session.

## Critère principal de réussite

> Le testeur atteint une publication Google Play réelle sans ouvrir Terminal, Android Studio, Gradle ni les dossiers techniques d'AppPublisher.

Les incompréhensions et blocages restent utiles même lorsque le test aboutit : ils deviennent les entrées prioritaires du backlog UX.

## Règle de décision

Après chaque session :

- un blocage reproduit par au moins deux testeurs devient prioritaire ;
- une incompréhension sur une action critique doit être simplifiée même si le testeur finit par réussir ;
- aucune nouvelle fonctionnalité avancée ne doit masquer un problème de compréhension du parcours de base.
