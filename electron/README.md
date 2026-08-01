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

## Packaging (Phase 3.6)

L'outil retenu est **electron-builder** (et non electron-packager) :

- une seule commande produit une `.app` macOS exécutable ;
- prépare le terrain pour la signature Apple Developer ID, la
  notarisation et l'auto-update sans changer d'outil ;
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

## Ce que le packaging **ne fait pas encore**

Volontairement hors périmètre de la Phase 3.6 (à traiter ultérieurement) :

- signature Apple Developer ID ;
- notarisation Apple ;
- génération `.dmg` / `.zip` sur macOS ;
- signature Authenticode Windows ;
- publication automatique / auto-update ;
- CI/CD (GitHub Actions, etc.).

L'architecture est prête pour ces ajouts : il suffira d'activer les
blocs correspondants dans `electron-builder.config.cjs`.
