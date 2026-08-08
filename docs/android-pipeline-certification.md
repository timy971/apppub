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
7. valide chaque bundle avec bundletool 1.18.2, téléchargé avec un SHA-256 verrouillé ;
8. inspecte package, versions, SDK, modules, hash et certificat avec le moteur AAB
   d'AppPublisher ;
9. exige deux verdicts `ready`, un `versionCode` croissant et le même certificat.

Le keystore et ses mots de passe sont supprimés avec le dossier temporaire, même en cas d'échec.
Ils ne sont ni committés, ni téléversés comme artefacts, ni écrits dans les rapports.

## Rapports

GitHub Actions conserve pendant 14 jours uniquement les rapports JSON expurgés :

- `certification-report.json` : résultat global et comparaison des deux releases ;
- `release-100.aab.apppublisher-report.json` ;
- `release-101.aab.apppublisher-report.json`.

Les AAB de test ne sont volontairement pas téléversés. Le rapport suffit à diagnostiquer la
chaîne sans conserver un binaire signé, même avec une clé éphémère.

## Exécution locale

Prérequis : Node.js, npm, JDK 21, Android SDK 35 et accès réseau pour Gradle. Téléchargez
bundletool 1.18.2, vérifiez son SHA-256 puis lancez :

```bash
APPPUBLISHER_BUNDLETOOL_JAR=/chemin/vers/bundletool.jar \
  npm run certify:android
```

Les résultats sont écrits dans `.artifacts/android-certification`, dossier ignoré par Git.
