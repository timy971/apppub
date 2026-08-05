# 05 — UX / UI / accessibilité

Mesures effectuées sur le renderer servi en développement (bridge mocké), Playwright headless Chromium, viewport 1280×1800.

## 5.1 Inventaire des écrans

14 routes (`src/routes/`) : `/` (Dashboard), `/projects`, `/projects/$id` (Cockpit), `/build`, `/publish`, `/signing`, `/version`, `/diagnostic`, `/history`, `/journal`, `/logs`, `/settings`, `/setup`, `__root`.

**Constat UX-001 (P1)** — Quatre routes exposent la même famille d'information sous quatre formes : `/diagnostic`, `/history`, `/journal`, `/logs`. Pour la cible annoncée (non technique), la distinction entre « journal » et « logs » n'est pas déductible du nom. Fusion recommandée en un seul écran « Activité » à deux niveaux (humain / expert).

**Constat UX-002 (P1)** — La santé du projet est rendue par au moins quatre composants distincts : `dashboard/global-health-card`, `dashboard/blockers-card`, `project-cockpit/health-card`, `publish-center/validation-summary`. Même source de vérité, quatre grammaires visuelles. Coût de maintenance et charge cognitive.

## 5.2 Densité et hiérarchie

- Dashboard : 7 widgets (`today`, `copilot-hero`, `next-step`, `ready`, `blockers`, `stats-strip`, `projects-grid`, `activity-timeline`). Aucun n'est repliable.
- Publish Center : 9 cartes sur une grille 2 colonnes.
- Sidebar : 12 entrées de navigation pour un produit dont le principe 1 est « simplicité avant richesse fonctionnelle ».

**Constat UX-003 (P2)** — Le produit affiche tout, tout le temps. La conséquence directe est que la *prochaine action* — l'élément qui porte toute la valeur du Copilot — ne domine visuellement rien. Recommandation : un seul bloc primaire par écran, le reste en second niveau.

## 5.3 Accessibilité

| Mesure | Résultat | Sévérité |
| --- | --- | --- |
| Champs de formulaire sans `<label>` associé ni `aria-label` | **34** | P1 |
| Focus initial en étape 1 du wizard | **absent** à l'origine, corrigé par focus différé (`requestAnimationFrame`) | résolu |
| Navigation arrière dans le wizard | absente | P1 |
| Contraste : palette de tokens sémantiques, aucune couleur codée en dur détectée dans les composants audités | conforme | — |
| Rôles ARIA sur les états de build (`live-status`, `progress-panel`) | pas de `aria-live` détecté sur les zones qui changent pendant un build | P2 |
| Navigation clavier de la palette de commandes (`cmdk`) | fournie par la librairie | OK |

**Constat A11Y-001 (P1)** — 34 champs sans étiquette programmatique. Sur un produit destiné à des utilisateurs non experts, dont certains en contexte professionnel réglementé (santé), c'est le défaut d'accessibilité le plus coûteux à corriger tard.

**Constat A11Y-002 (P2)** — Un build long modifie l'écran sans annonce vocale. Ajouter `aria-live="polite"` sur l'état d'étape et `role="log"` sur la console suffirait.

## 5.4 Retours d'état et gestion d'erreur

Points forts, à conserver :
- `src/core/errors/translator.ts` : messages Gradle/keytool traduits en langage courant, testé.
- `error-panel.tsx`, `error-card.tsx` : erreur + cause + action proposée. Conforme au principe 5.
- `preflight-card.tsx` : annonce ce qui va être fait avant de le faire. Conforme au principe 3.
- Console de build virtualisée (`log-console.tsx`) : ne gèle pas l'UI sur un log volumineux.

Point faible :
- **Constat UX-004 (P0)** — Hors Electron, `src/core/bridge/web.ts` renvoie des succès simulés (`fakeExec`, `node: "22.0.0 (simulé)"`) sans bandeau d'avertissement persistant dans l'UI. Un utilisateur ne peut pas distinguer un succès réel d'une simulation. Voir PROD-004.

## 5.5 Charge lexicale

`src/core/i18n/fr.ts` a été créé pour centraliser le vocabulaire, mais **aucun module ne l'importe** (0 importeur mesuré). Les libellés sont donc dispersés dans 128 fichiers `.tsx`, ce qui rend impossible une relecture éditoriale cohérente — pourtant l'un des leviers les plus rentables pour la cible visée.

**Constat UX-005 (P2)** — Le dictionnaire existe mais n'est pas branché. Voir aussi [06](06-audit-architecture-code.md) (code mort).

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| UX-004 | Succès simulés indistinguables des succès réels hors Electron | P0 |
| A11Y-001 | 34 champs sans étiquette | P1 |
| UX-001 | 4 écrans d'activité redondants | P1 |
| UX-002 | 4 rendus concurrents de la santé projet | P1 |
| UX-A-001 | Wizard sans retour arrière | P1 |
| UX-003 | Densité : la prochaine action ne domine pas | P2 |
| A11Y-002 | Pas d'`aria-live` pendant un build | P2 |
| UX-005 | Dictionnaire `i18n/fr.ts` non branché | P2 |
