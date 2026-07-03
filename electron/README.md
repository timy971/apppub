# AppPublisher — Intégration Electron

Ce dossier contient le **main process** (`main.cjs`) et le **preload** (`preload.cjs`)
d'AppPublisher. Le renderer (le code React) n'a jamais accès direct à Node.js :
toute opération système passe par le contrat typé exposé via `contextBridge`,
puis consommé côté renderer par `src/core/bridge/electron.ts`.

## Architecture

```
┌────────────────────────┐        ┌────────────────────────┐
│  Renderer (React)      │        │  Main process (Node)   │
│  src/core/bridge/*     │  IPC   │  electron/main.cjs     │
│                        │◀──────▶│  spawn / fs / dialog   │
│  window.appPublisher   │        │                        │
└────────────────────────┘        └────────────────────────┘
        ▲
        │ exposé par
        │
┌────────────────────────┐
│  electron/preload.cjs  │  (contextIsolation:true, sandbox:true)
└────────────────────────┘
```

## Lancement en développement

```bash
# terminal 1 : dev server web
npm run dev
# terminal 2 : Electron pointant sur le dev server
APPPUBLISHER_DEV_URL=http://localhost:8080 npx electron electron/main.cjs
```

## Packaging (production)

Installer les outils localement (hors sandbox Lovable) :

```bash
npm i --save-dev electron @electron/packager
```

Puis :

```bash
# macOS
npm run build && \
  npx @electron/packager . AppPublisher \
  --platform=darwin --arch=arm64 \
  --out=electron-release --overwrite \
  --ignore='^/src' --ignore='^/electron-release'

# Windows
npm run build && \
  npx @electron/packager . AppPublisher \
  --platform=win32 --arch=x64 \
  --out=electron-release --overwrite
```

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Aucune API Node exposée sans passer par `ipcMain.handle`.
- Aucun `remote`, aucun `require` dans le renderer.
- Les entrées utilisateur (chemins de dossier) ne sont utilisées que via les
  handlers IPC ; le renderer ne construit jamais de commande shell brute.
