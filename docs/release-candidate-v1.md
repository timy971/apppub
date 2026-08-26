# Lot 11 — Release Candidate / bêta V1

## Objectif

Le lot 11 ne cherche pas à ajouter de nouvelles fonctions. Il transforme la version actuellement validée d'AppPublisher en candidate de sortie reproductible, testable sur une machine propre et distribuable sans divergence entre le code certifié et les binaires livrés.

Référence de départ : branche `agent/lot-10-premiere-publication-google-play`, après les correctifs de parcours, de versionCode Google Play et de détection/configuration automatique du SDK Android.

## 11.1 — Gel et certification automatique

Une candidate est acceptable seulement si :

- `package.json` et `version.json` portent la même version ;
- les ressources Electron, macOS et Windows nécessaires à la distribution sont présentes ;
- macOS reste distribué en DMG + ZIP universels, signé et notarisé ;
- Windows reste distribué en NSIS x64 avec signature obligatoire ;
- la Quality gate conserve la construction de deux AAB signés consécutifs ;
- les workflows officiels macOS et Windows installent les dépendances depuis `bun.lock` avec `bun install --frozen-lockfile` ;
- tests, certification UX, TypeScript, lint et build Electron passent ;
- un packaging non signé de smoke test réussit réellement sur un runner macOS et un runner Windows.

Le workflow `.github/workflows/release-candidate.yml` exécute ces contrôles sur chaque PR du lot 11 et peut aussi être déclenché manuellement.

## 11.2 — Distribution native signée

Après le vert du lot 11.1 :

1. lancer manuellement **Release macOS** ;
2. vérifier que le DMG et le ZIP sont signés, notarisés et que `latest-mac.yml` est produit ;
3. lancer manuellement **Release Windows** ;
4. vérifier l'Authenticode de `AppPublisher-Setup.exe`, son installation/désinstallation silencieuse et `latest.yml` ;
5. ne créer aucun tag public tant que ces deux workflows natifs ne sont pas verts.

Ces workflows nécessitent les secrets de signature Apple/Windows et le client OAuth Google Play. Leur absence doit bloquer la distribution plutôt que produire un binaire dégradé.

## 11.3 — Recette « machine neuve »

La recette finale doit être faite sans environnement de développement AppPublisher préexistant.

### macOS

- installer AppPublisher depuis le DMG ;
- lancer l'application depuis `/Applications` ;
- vérifier qu'aucun terminal n'est nécessaire ;
- importer un dépôt GitHub/Lovable de test ;
- lancer le diagnostic système ;
- vérifier la détection du JDK et du SDK Android ;
- si Android Studio a installé le SDK sans `ANDROID_HOME`, vérifier qu'AppPublisher le configure automatiquement ;
- préparer une version, créer/associer la signature, générer l'AAB ;
- connecter Google Play ;
- publier sur la piste interne ;
- provoquer volontairement un versionCode trop faible et vérifier la proposition d'un minimum valide ;
- quitter, relancer et vérifier la conservation du projet, des réglages et de la signature.

### Windows 10/11

Rejouer exactement le même parcours depuis `AppPublisher-Setup.exe`, avec en plus :

- installation sans droits administrateur dans le cas normal ;
- raccourci du menu Démarrer fonctionnel ;
- stockage sécurisé des secrets ;
- désinstallation puis réinstallation sans perte involontaire des données utilisateur.

## 11.4 — Critères de sortie bêta V1

La bêta V1 est autorisée quand :

- Quality gate : verte ;
- Release candidate : verte sur Linux, macOS et Windows ;
- Release macOS signée/notarisée : verte ;
- Release Windows signée : verte ;
- au moins un parcours complet réel sur machine propre macOS ;
- au moins un parcours complet réel sur machine propre Windows ;
- publication Google Play interne réussie depuis chaque OS testé ;
- aucun défaut bloquant ou critique ouvert ;
- les journaux de support ne contiennent ni mot de passe, ni clé privée, ni jeton OAuth.

## Règle pendant le lot 11

Aucune grosse fonction produit n'entre dans la candidate. Une modification est acceptée uniquement si elle corrige un défaut de fiabilité, d'installation, de sécurité, de compréhension du parcours ou de distribution.
