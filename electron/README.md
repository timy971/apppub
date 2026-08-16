# AppPublisher — Intégration Electron & Packaging

Ce dossier contient le **main process** (`main.cjs`) et le **preload**
(`preload.cjs`) d'AppPublisher. Le renderer (le code React) n'a jamais
accès direct à Node.js : toute opération système passe par le contrat
typé exposé via `contextBridge`, consommé côté renderer par
`src/core/bridge/electron.ts`.

## Architecture

```
┌────────────────────────┐        ┌────────────────────────┐
│  Renderer (React)      │        │  Main process (Node)   │
│  src/core/bridge/*     │  IPC   │  electron/main.cjs     │
│  window.appPublisher   │◀──────▶│  spawn / fs / dialog   │
└────────────────────────┘        └────────────────────────┘
        ▲
        │
┌────────────────────────┐
│  electron/preload.cjs  │  (contextIsolation:true, sandbox:true)
└────────────────────────┘
```

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- `exec:run` n'accepte que les workflows exacts nécessaires à l'application
  (build web, Capacitor, version et bundle Android), avec `shell:false` et
  confirmation native avant la première exécution de code d'un projet.
- Un dossier projet n'est approuvé qu'après sélection dans un dialogue natif.
  Les racines système, le dossier utilisateur et les liens symboliques sortants
  sont refusés après canonicalisation (`realpath`). Les autorisations héritées
  de l'ancien renderer ne sont pas reprises ; l'écran projet propose une
  réautorisation native sans recréer la fiche.
- Le renderer ne dispose d'aucune primitive générique d'écriture. Les
  sauvegardes, la restauration et l'injection Gradle passent par des opérations
  natives dédiées, validées fichier par fichier. Le bloc Gradle est construit
  dans le main process : aucun contenu de fichier fourni par React n'est écrit.
- Un keystore choisi n'autorise que ce fichier exact, de façon persistante ;
  son dossier parent n'est pas rendu lisible par le renderer.
- Les données applicatives sont stockées dans un fichier JSON versionné et
  écrit atomiquement sous `userData`, avec récupération depuis une copie de
  secours. Les mots de passe restent exclusivement dans le trousseau système.
- Les redirections, nouvelles fenêtres, webviews et permissions sont bloquées
  par défaut. Les outils de développement sont désactivés dans le paquet final.
- **Instance unique** : les tentatives de double-lancement raménent la
  fenêtre existante au premier plan.
- **Erreurs non capturées** : `uncaughtException` déclenche une boîte de
  dialogue explicative sans crasher l'application.

## Persistance de fenêtre

Position, taille et état maximisé de la fenêtre sont écrits dans
`window-state.json` (dossier `userData` d'Electron) à chaque fermeture
et restaurés au lancement suivant.

## Packaging et distribution macOS (lots 3 et 7)

L'outil retenu est **electron-builder** (et non electron-packager) :

- une seule commande produit une `.app` macOS exécutable ;
- le mode distribution produit un DMG et un ZIP universels, signés et
  notarisés, avec le manifeste nécessaire aux mises à jour ;
- gère automatiquement la conversion `icon.png` → `icon.icns` / `icon.ico`
  lorsque le format cible est absent.

Configuration : voir `electron-builder.config.cjs` et `app.config.cjs`
à la racine. Métadonnées, identifiant bundle et cibles y sont centralisés.

### Commandes

```bash
# Installation locale des dépendances de packaging (une seule fois)
npm install --save-dev electron electron-builder

# Régénérer les icônes .icns / .ico depuis build/icon.png (macOS)
npm run make:icons

# Développement — hot reload
npm run dev            # terminal 1 (Vite)
npm run electron:dev   # terminal 2 (Electron sur http://localhost:8080)

# Packaging macOS (arm64) — produit dist-app/mac-arm64/AppPublisher.app
npm run pack:mac

# Distribution officielle — vérifie les secrets, signe et notarise sans publier
npm run release:mac

# Distribution officielle, certification, puis publication GitHub depuis un tag vX.Y.Z
npm run release:mac:publish

# Packaging Windows (x64) — produit dist-app/AppPublisher Setup *.exe + .zip
# (exécutable depuis Windows, ou depuis macOS avec Wine installé)
npm run pack:win
```

Le dossier `dist-app/` est **entièrement nettoyé** avant chaque packaging
pour ne jamais mélanger les binaires d'anciennes versions.

### Version

La source de vérité unique est `/version.json` à la racine du dépôt.
`scripts/sync-version.cjs` (appelé automatiquement par `pack:*`) recopie
cette valeur dans `package.json` avant qu'electron-builder ne construise
les binaires. L'UI de l'application lit également ce fichier via une
constante injectée par Vite (`__APP_VERSION__`).

### Icônes

- Source : `build/icon.png` (1024×1024).
- Générés : `build/icon.icns` (macOS) et `build/icon.ico` (Windows).
- Remplacement : remplacer `icon.png`, puis `npm run make:icons`.

electron-builder utilisera `icon.png` seul si les formats natifs sont
absents, mais la qualité est meilleure avec les fichiers dédiés.

## Distribution officielle macOS

Le pipeline du lot 7 prend désormais en charge :

- signature Apple Developer ID et hardened runtime ;
- notarisation Apple et génération `.dmg` / `.zip` universelle ;
- publication GitHub et mises à jour automatiques signées ;
- refus explicite si le client OAuth Google ou un justificatif manque ;
- workflow GitHub Actions sans secret versionné.

Le guide pas à pas et la grille de validation sur Mac propre sont dans
[`docs/macos-distribution.md`](../docs/macos-distribution.md).

Restent hors périmètre de ce pipeline macOS :

- signature Authenticode Windows ;
- publication et mise à jour automatique de la cible Windows.
