# 06 — Architecture & code

## 6.1 Volumétrie

| Zone | Mesure |
| --- | --- |
| `src/` TypeScript/TSX | **27 343 lignes**, dont 128 fichiers `.tsx` |
| `electron/` (CommonJS) | **4 895 lignes** sur 16 fichiers |
| `electron/main.cjs` seul | **2 397 lignes** (49 % du main process) |
| Handlers IPC exposés | **48** |
| Règles Copilot | 9 (`src/core/copilot/rules/`) |
| Tests unitaires (vitest) | 12 fichiers / 49 tests |
| Tests Node (main process) | 15 fichiers / 58 tests |

## 6.2 Découpage en couches

Le découpage est **lisible et volontaire**, c'est la principale qualité du projet :

```text
  routes/            écrans (14)
  components/        widgets autonomes par écran (dashboard, cockpit, build, publish)
  features/          domaine isolé (android-signing)
  core/
    copilot/         moteur d'intention — source de vérité des actions
    projects/status/ moteur de règles projet
    build/           preflight, gradle, signing-injector
    publish/         vérification d'artefact
    bridge/          frontière renderer ↔ main (electron | web mocké)
    errors/          traduction des erreurs
  electron/          main process, un module par responsabilité
```

Points forts vérifiés :
- **Frontière unique** renderer ↔ système : tout passe par `src/core/bridge/`. Aucun `require` Node dans les composants.
- **Moteurs à règles** (`ProjectRule`, `CopilotRule`) : ajouter une contrainte de store = ajouter un fichier. C'est exactement le point d'extension dont le produit a besoin pour BIZ-001.
- **Modularisation du main process** : `path-security`, `execution-policy`, `process-manager`, `project-trust`, `signing-session`, `diagnostic-redaction` sont des modules courts, testés unitairement.

## 6.3 Dettes structurelles

**Constat ARCH-001 (P1)** — `electron/main.cjs` à 2 397 lignes concentre 48 handlers IPC. C'est le seul fichier du projet qui a échappé à la modularisation qu'il applique lui-même partout ailleurs. Toute erreur de validation d'entrée y est une faille potentielle et la revue y est difficile. Découpage recommandé par domaine (`ipc/fs.cjs`, `ipc/git.cjs`, `ipc/signing.cjs`, `ipc/gradle.cjs`, `ipc/diag.cjs`).

**Constat ARCH-002 (P2)** — Sources de vérité concurrentes résiduelles. Le Copilot a été désigné source unique, mais subsistent : `src/core/health/service.ts` (1 importeur), `src/core/workflow/engine.ts` (1 importeur), `src/core/checklist/service.ts` (**0 importeur**), `src/core/diag/analyzer.ts` (1 importeur). Violation partielle du principe 2.

**Constat ARCH-003 (P2)** — Code mort mesuré, à supprimer :

| Module | Importeurs |
| --- | --- |
| `src/core/i18n/fr.ts` | **0** |
| `src/core/checklist/service.ts` | **0** |
| `src/components/copilot-card.tsx` | **0** |

Ces trois modules sont des vestiges de refontes successives. `i18n/fr.ts` est un cas particulier : il ne doit pas être supprimé mais **branché** (UX-005).

**Constat ARCH-004 (P2)** — Duplication de widgets de santé (voir UX-002) : quatre composants dérivent le même état. Un composant paramétrable et une seule dérivation suffiraient.

## 6.4 Frontière de sécurité

La frontière est correctement conçue et testée (`tests/electron-boundary.node-test.cjs`, `path-security`, `execution-policy`, `window-security`) :
- `contextIsolation` + `preload` de 202 lignes exposant une API nommée, pas `ipcRenderer` brut.
- Toute exécution passe par une **allowlist** de commandes et d'arguments exacts (`sameArgs`), pas par une expression régulière.
- Tout chemin passe par un registre d'accès (`resolveExisting`) confiné aux dossiers autorisés.
- Les variables d'environnement de signature (`ORG_GRADLE_PROJECT_*`) sont allowlistées et les secrets ne touchent ni `argv` ni le disque.

C'est un niveau de rigueur inhabituel pour une alpha, et cela doit être dit : **l'architecture de sécurité est l'actif principal du projet.**

Réserve : l'allowlist est stricte au point d'être fragile côté produit (voir parcours E). La rigueur est correcte ; le message d'erreur quand elle refuse ne l'est pas.

## 6.5 Cohérence du stack

- Renderer : React 18.3 + TanStack Router en `createHashHistory()` (obligatoire sous `file://` — correctif validé).
- Deux configurations Vite : `vite.config.ts` (web) et `vite.electron.config.ts` (SPA Electron). Découpage justifié.
- `package.json` porte encore `"name": "tanstack_start_ts"` alors que le produit s'appelle AppPublisher, et la version y est synchronisée depuis `version.json` par `scripts/sync-version.cjs`. Cosmétique (P4) mais visible dans les métadonnées du paquet.

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| ARCH-001 | `main.cjs` monolithique : 2 397 lignes, 48 handlers IPC | P1 |
| ARCH-002 | Sources de vérité concurrentes résiduelles | P2 |
| ARCH-003 | 3 modules morts mesurés (0 importeur) | P2 |
| ARCH-004 | Duplication des widgets de santé | P2 |
| — | `package.json` nommé `tanstack_start_ts` | P4 |
