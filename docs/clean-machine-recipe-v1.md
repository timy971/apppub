# Lot 11.3 — Recette machine neuve

## But

Valider AppPublisher comme un produit installé, pas seulement comme un projet qui compile.

Le lot 11.3 sépare deux niveaux :

1. **recette native automatisée** sur un runner Windows GitHub neuf ;
2. **parcours produit réel** effectué une fois par un utilisateur avec son compte Google Play.

La signature macOS/Windows n'est pas requise pour cette bêta privée. Elle reste obligatoire avant toute diffusion publique.

---

## A. Recette Windows automatisée

Le workflow `Release candidate` construit `AppPublisher-Setup.exe` puis exécute `scripts/smoke-win-clean-install.ps1` sur un runner `windows-2025` neuf.

La gate vérifie réellement :

- présence et taille cohérente de l'installateur ;
- statut Authenticode `NotSigned`, attendu pour la bêta privée ;
- installation silencieuse par utilisateur sans élévation explicite ;
- création de l'entrée de désinstallation Windows ;
- présence de `AppPublisher.exe` dans l'installation ;
- métadonnées produit `AppPublisher` ;
- création du raccourci du menu Démarrer ;
- création d'une donnée utilisateur témoin ;
- désinstallation silencieuse ;
- suppression du programme et de son entrée de registre ;
- conservation volontaire des données utilisateur ;
- réinstallation ;
- restauration du programme sans perte des données utilisateur.

Le résultat est écrit dans :

`.artifacts/windows-clean-machine-smoke.json`

Le même artefact GitHub Actions `AppPublisher-Windows-private-beta` contient :

- `AppPublisher-Setup.exe` ;
- le rapport de recette machine neuve.

Verdict attendu :

`ready-for-manual-product-journey`

---

## B. Parcours produit réel — Windows

À faire une fois avec le binaire produit par la gate, de préférence sur un PC Windows 10/11 qui n'a jamais servi au développement d'AppPublisher.

### Installation

- télécharger l'artefact `AppPublisher-Windows-private-beta` ;
- extraire le ZIP ;
- lancer `AppPublisher-Setup.exe` ;
- accepter l'avertissement Windows lié à l'éditeur inconnu : il est normal pour cette bêta privée non signée ;
- vérifier qu'AppPublisher apparaît dans le menu Démarrer ;
- lancer AppPublisher sans terminal ni outil de développement.

### Parcours AppPublisher → Google Play

1. importer un dépôt GitHub/Lovable de test ;
2. lancer le diagnostic système ;
3. vérifier que Git, Java/JDK et Android SDK sont détectés ;
4. si `ANDROID_HOME` n'est pas défini mais que le SDK est installé par Android Studio, vérifier que le SDK est quand même trouvé ;
5. préparer le projet Android ;
6. choisir/incrémenter la version ;
7. créer ou sélectionner le keystore Android ;
8. construire l'AAB ;
9. valider l'AAB dans AppPublisher ;
10. connecter le compte Google Play ;
11. publier sur la piste interne ;
12. provoquer volontairement un `versionCode` trop faible ;
13. vérifier qu'AppPublisher explique le problème et propose un minimum compatible ;
14. corriger avec la proposition puis republier avec succès.

### Persistance

- fermer complètement AppPublisher ;
- relancer l'application ;
- vérifier que le projet et les réglages utiles sont toujours présents ;
- vérifier que les secrets sensibles ne sont pas affichés en clair ;
- désinstaller AppPublisher ;
- réinstaller le même installateur ;
- vérifier que les données utilisateur prévues comme persistantes sont toujours disponibles.

### Journaux de support

Générer un journal de support après le parcours et vérifier qu'il ne contient pas :

- mot de passe de keystore ;
- clé privée ;
- jeton OAuth ;
- secret client Google ;
- contenu brut d'un fichier de credentials sensible.

---

## C. Critère de validation du lot 11.3

Le lot 11.3 est considéré terminé lorsque :

- la recette Windows automatisée est verte ;
- son rapport porte le verdict `ready-for-manual-product-journey` ;
- le parcours réel AppPublisher → Google Play interne a réussi au moins une fois avec l'installateur de bêta privée ;
- aucun défaut bloquant n'a été découvert pendant installation, relance ou réinstallation ;
- aucun secret n'apparaît dans les journaux de support.

Le parcours macOS peut continuer à être testé localement avec l'application non signée. Une distribution macOS publique restera suspendue jusqu'à l'activation d'un compte Apple Developer et de la notarisation.
