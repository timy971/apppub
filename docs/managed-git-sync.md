# Synchronisation Git avant une release

## Parcours utilisateur

1. Ouvrir Configuration → Projet Git (également visible en mode Découverte).
2. Vérifier. Les sauvegardes internes non suivies ne comptent plus comme modifications du code.
3. Si nécessaire, choisir **Sauvegarder et synchroniser** et lire la confirmation : tous les changements locaux, y compris les modifications manuelles, sont mis de côté. Aucun fichier n'est identifié comme « supprimable » sur son seul nom.
4. Le code distant est récupéré en fast-forward, sans réappliquer les anciens fichiers.
5. La version sélectionnée et le numéro interne ne sont pas abaissés par la relecture des métadonnées du dépôt. Vérifier le numéro proposé par rapport au dernier numéro déjà importé dans Google Play.
6. Reconstruire l'AAB. La version sélectionnée est alignée avant la compilation web puis après Capacitor. Les corrections utilisent le moteur existant avec sauvegarde et confirmation native.

La préparation de version, le build, la préparation de publication et l'envoi Google Play vérifient l'état distant. Si le réseau est indisponible ou si la branche n'est pas à jour, l'opération s'arrête. Un AAB dont le commit diffère du HEAD courant ou dont le commit est inconnu doit être reconstruit.

## Sauvegarde et récupération

L'action de synchronisation crée un stash incluant les fichiers suivis, indexés et non suivis du projet. Les sauvegardes internes non suivies restent à leur emplacement pour garder les liens de restauration valides dans Ressources. Une référence locale indépendante `refs/apppublisher/sync-backups/<identifiant>` conserve le snapshot même si l'entrée de stash est retirée plus tard. Cette référence est inscrite dans le journal ; un échec après sauvegarde la mentionne aussi dans son message. Aucun snapshot n'est automatiquement réappliqué ou supprimé.

Ces références sont locales à la copie gérée : ce n'est pas une sauvegarde distante. Ne pas supprimer cette copie avant d'avoir récupéré un travail manuel nécessaire.

Pour une récupération assistée, consulter d'abord les différences avec `git stash show --include-untracked <référence>`. Au besoin, créer une branche de récupération sur le parent `<référence>^1` dans un worktree séparé, puis y appliquer `git stash apply --index <référence>`. Ne pas appliquer le snapshot sur la branche synchronisée pour tenter de récupérer seulement les anciens numéros de version.

## Limites et vérification

Le contrôle d'origine compare les commits et conserve le signalement des modifications locales. Il ne constitue pas une empreinte exhaustive de tous les fichiers locaux. Les projets importés comme dossiers, sans source Git gérée, conservent leur fonctionnement habituel.

Les tests utilisent de vrais dépôts Git locaux : 70 sauvegardes, plus de 50 changements, modifications suivies/indexées/non suivies, panne réseau, échec de fusion, commits locaux non publiés et récupération après retrait de l'entrée de stash. Les tests du moteur vérifient le blocage avant npm, la conservation de 1.2.0 (19), l'alignement de version et le rejet d'un ancien AAB.

Ce correctif doit être intégré à une nouvelle installation AppPublisher. La mise à jour du seul dépôt CrânioScan ne modifie pas l'application AppPublisher déjà installée sur le Mac.
