# Lot 15 — Cycle complet de diffusion Google Play

## Objectif

Étendre le parcours Google Play validé sur la piste interne sans rendre la publication production dangereuse ou opaque.

Le parcours produit devient :

**AAB → Test interne → Test fermé → Test ouvert → Production**

Un nouvel AAB continue d'entrer par la piste interne. Les étapes suivantes réutilisent le `versionCode` déjà présent sur Google Play : AppPublisher ne téléverse pas une seconde fois le même AAB.

## Pistes gérées

- `internal` — test interne ;
- `alpha` — piste fermée par défaut ;
- `beta` — piste ouverte par défaut ;
- `production` — production.

AppPublisher lit les pistes réelles via la Google Play Developer API et affiche les `versionCode` présents sur chacune.

## Promotion

Une promotion :

1. ouvre une édition Google Play ;
2. vérifie que le `versionCode` existe déjà sur Google Play ;
3. refuse d'écraser une release non terminée sur la piste cible ;
4. met à jour la piste cible avec ce `versionCode` ;
5. valide l'édition ;
6. commit l'édition avec `ERROR_IF_IN_REVIEW`.

Aucun nouvel upload AAB n'est effectué lors d'une promotion.

## Garde-fous production

La promotion vers la production est refusée tant que les confirmations applicables du Lot 14 ne sont pas satisfaites :

- vérification développeur confirmée ;
- package Android enregistré ;
- pour un compte personnel créé après le 13 novembre 2023 :
  - test fermé requis terminé ;
  - accès production explicitement marqué comme accordé.

Le passage en production déclenche une confirmation native distincte.

AppPublisher n'affirme jamais qu'une version est déjà publique simplement parce qu'elle est présente sur la piste `production`. Une revue Google ou une publication en attente peut encore s'appliquer.

## Nouveaux comptes personnels

Pour un compte personnel récent, le test ouvert peut rester indisponible jusqu'à l'accès production accordé. AppPublisher conserve donc un état explicite :

- à confirmer ;
- demande envoyée ;
- accès accordé.

Cette information est confirmée par l'utilisateur : l'API utilisée ne permet pas à AppPublisher de la déduire de manière suffisamment fiable.

## Reprise

Les checkpoints de reprise Google Play sont désormais liés à une piste. Une reprise commencée sur `internal` ne peut jamais être réutilisée sur `alpha`, `beta` ou `production`.

## Non-régression

Les tests vérifient :

- la lecture des quatre pistes canoniques ;
- la promotion d'un `versionCode` sans upload AAB ;
- l'isolation des checkpoints par piste ;
- l'absence de faux statut « déjà public » ;
- les garde-fous production.
