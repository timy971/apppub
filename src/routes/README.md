# Routes AppPublisher

Convention TanStack Router : un fichier `*.tsx` = une route. La chaîne dans
`createFileRoute("/...")` doit correspondre exactement au nom du fichier.

## Carte des routes (Phase 1)

| Fichier             | URL           | Rôle                                    |
| ------------------- | ------------- | --------------------------------------- |
| `__root.tsx`        | layout        | Sidebar, thème, providers               |
| `index.tsx`         | `/`           | Tableau de bord                         |
| `setup.tsx`         | `/setup`      | Assistant de première configuration     |
| `projects.tsx`      | `/projects`   | Liste et gestion des projets            |
| `version.tsx`       | `/version`    | Assistant de versionning                |
| `build.tsx`         | `/build`      | Assistant de construction Android       |
| `publish.tsx`       | `/publish`    | Checklist de publication (Phase 4)      |
| `diagnostic.tsx`    | `/diagnostic` | Santé du projet                         |
| `history.tsx`       | `/history`    | Historique des publications             |
| `settings.tsx`      | `/settings`   | Paramètres                              |
| `journal.tsx`       | `/journal`    | Journal technique caché (support only)  |

## Architecture modulaire

- `src/core/*` : logique métier, contrats et services (`storage`, `projects`,
  `version`, `diagnostic`, `workflow`, `history`, `journal`, `errors`,
  `settings`, `store`). Chaque module est indépendant et remplaçable.
- `src/components/*` : composants UI transverses (sidebar, workflow-view,
  status-dot, contextual-help, mode-badge, theme-provider, page-header).
- `src/routes/*` : uniquement de la composition. Aucune logique métier ici.

## Phases suivantes

- **Phase 2** : brancher les services `projects`, `version`, `build` sur des
  appels IPC Electron. Les interfaces publiques ne changent pas.
- **Phase 3** : GitHub via un nouveau module `src/core/github`.
- **Lot 6** : Google Play via le bridge natif `googlePlay`, limité à la piste
  `internal`, avec identifiants dans le trousseau et confirmation explicite.
- **Phase 5** : iOS + plugins, via un module `src/core/plugins`.
