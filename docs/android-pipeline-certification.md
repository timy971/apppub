# Certification de la chaîne Android

Le workflow `Quality gate` prouve la chaîne Android avant toute intégration Google Play. Il ne
publie rien et n'utilise aucune clé réelle.

## Preuve exécutée

Le job `Two signed Android releases` :

1. crée un projet Android à partir d'une fixture Capacitor 7 verrouillée ;
2. génère un keystore RSA éphémère dans le dossier temporaire du runner ;
3. applique le bloc de signature géré par AppPublisher ;
4. utilise le moteur de correction AppPublisher pour produire les versions `1.0.0 (100)` puis
   `1.0.1 (101)` ;
5. construit deux AAB release avec Gradle ;
6. vérifie chaque signature avec `jarsigner` et lit le certificat avec `keytool` ;
7. prépare avec `scripts/ensure-bundletool.cjs` le même bundletool 1.18.2 que celui embarqué dans
   l'application, avec le SHA-256 verrouillé
   `378b5434cd1378bef6b2bc527b8c7f0ff2584b273830335bce54d6d0813c8584` ;
8. valide chaque bundle avec ce JAR ;
9. inspecte package, versions, SDK, modules, hash et certificat avec le moteur AAB d'AppPublisher ;
10. exige deux verdicts `ready`, un `versionCode` croissant et le même certificat.

Le keystore et ses mots de passe sont supprimés avec le dossier temporaire, même en cas d'échec.
Ils ne sont ni committés, ni téléversés comme artefacts, ni écrits dans les rapports.

## bundletool dans l'application distribuée

Une bêta ou release AppPublisher prépare automatiquement le même JAR vérifié au packaging puis
l'embarque sous `Resources/tools/bundletool.jar`. Le moteur Electron recherche cet emplacement en
priorité et exécute `java -jar bundletool.jar validate --bundle=...` lors de l'inspection d'un AAB.

L'utilisateur n'a donc aucun téléchargement ni réglage bundletool à effectuer. La Release Candidate
vérifie en plus le SHA-256 du JAR réellement contenu dans les DMG et dans l'installation Windows.

## Rapports

GitHub Actions conserve pendant 14 jours uniquement les rapports JSON expurgés :

- `certification-report.json` : résultat global et comparaison des deux releases ;
- `release-100.aab.apppublisher-report.json` ;
- `release-101.aab.apppublisher-report.json`.

Les AAB de test ne sont volontairement pas téléversés.

## Exécution locale

Prérequis : Node.js, npm, JDK 21, Android SDK 35 et accès réseau pour Gradle et le premier
téléchargement de bundletool.

```bash
node scripts/ensure-bundletool.cjs
APPPUBLISHER_BUNDLETOOL_JAR="$PWD/build/tools/bundletool.jar" npm run certify:android
```

Le JAR est réutilisé uniquement si son SHA-256 correspond exactement au pin certifié. Les résultats
sont écrits dans `.artifacts/android-certification`, dossier ignoré par Git.
