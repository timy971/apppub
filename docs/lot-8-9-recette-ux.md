# Lot 8.9 — recette UX finale

Cette recette valide le dernier kilomètre d’AppPublisher avec des mots simples. Elle complète les tests automatiques sans remplacer un essai réel de l’application macOS installée.

## Avant de commencer

- Utiliser une copie d’un projet Capacitor Android publiable.
- Conserver la même clé de signature pour les deux fichiers Android.
- Partir d’un numéro interne encore jamais envoyé sur Google Play.
- Tester l’application installée, pas seulement la version ouverte dans le navigateur.
- Ne pas ouvrir le Terminal pendant le parcours novice.

Lancer le garde-fou automatique avec `npm run certify:ux`. Le résultat attendu est zéro échec.

## Profil 1 — novice

Le testeur ne connaît ni Gradle, ni AAB, ni `versionCode`.

| Étape | Action | Résultat attendu |
| --- | --- | --- |
| 1 | Ajouter l’application depuis son dossier ou son dépôt GitHub | L’application active et la prochaine action sont évidentes. |
| 2 | Ouvrir « Vérifier l’application » | Chaque blocage est expliqué et propose une action compréhensible. |
| 3 | Préparer la version | Le nom public et le numéro interne sont distingués. |
| 4 | Créer ou choisir la signature | La signature est associée à l’application sans demander de paramètres avancés. |
| 5 | Créer le fichier Android | La progression est visible, puis « Continuer vers la publication » apparaît. |
| 6 | Préparer la publication et publier sur le test interne | Le compte, l’application Play Console, le fichier et la piste interne ont chacun un état clair. |

Critère de réussite : le testeur termine sans Terminal, sans chercher un chemin de fichier et sans confondre « préparé » avec « envoyé ».

## Profil 2 — utilisateur accompagné

- Provoquer une vérification impossible, puis confirmer la présence de « Réessayer » et « Préparer une demande d’aide ».
- Corriger un blocage de version ou de signature, puis vérifier que le parcours revient à l’étape d’origine.
- Fermer et rouvrir AppPublisher, puis confirmer que la dernière étape utile est proposée.
- Vérifier que les changements réalisés par AppPublisher sont annoncés et annulables depuis la fiche de l’application.

Critère de réussite : chaque échec indique ce qui s’est passé, l’action suivante et une voie d’assistance.

## Profil 3 — expert

- Activer le mode Expert dans les réglages.
- Vérifier que les chemins, commandes, journaux et rapports de contrôle restent disponibles.
- Tester tous les boutons « Copier » dans les détails du fichier, les ressources, les notes de version et le journal.
- Exporter un diagnostic pour le support et vérifier qu’aucun mot de passe n’y figure.

Critère de réussite : les détails techniques sont disponibles à la demande sans encombrer les modes Découverte et Assistant.

## Deuxième publication

1. Après un premier envoi interne réussi, préparer une nouvelle version.
2. Vérifier qu’AppPublisher refuse de réutiliser le même numéro interne.
3. Utiliser « Augmenter le numéro interne ».
4. Recréer le fichier Android avec la même signature.
5. Publier ce second fichier sur la piste interne.

Critère de réussite : le second numéro est strictement supérieur au premier et Google Play accepte le fichier signé avec la même clé.

## Fiche de résultat

| Contrôle | Résultat | Preuve ou remarque |
| --- | --- | --- |
| Parcours novice sans Terminal | ☐ Réussi ☐ Échec | |
| Première publication interne | ☐ Réussie ☐ Échec | |
| Deuxième publication avec numéro supérieur | ☐ Réussie ☐ Échec | |
| Reprise après fermeture | ☐ Réussie ☐ Échec | |
| Annulation des modifications | ☐ Réussie ☐ Échec | |
| Boutons Copier dans l’application installée | ☐ Réussis ☐ Échec | |
| Demande d’aide exportable | ☐ Réussie ☐ Échec | |
| Outils experts conservés | ☐ Oui ☐ Non | |

Le lot 8.9 est validé lorsque les tests automatiques sont verts et que cette fiche ne contient aucun échec bloquant sur une installation macOS propre.
