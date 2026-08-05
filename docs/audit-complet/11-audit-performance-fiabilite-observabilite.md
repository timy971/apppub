# 11 — Performance, fiabilité, observabilité

## 11.1 Performance

| Mesure | Valeur | Commentaire |
| --- | --- | --- |
| Code source renderer | 27 343 lignes TS/TSX, 128 composants | Volume élevé pour 14 écrans |
| Build Electron (`vite build --config vite.electron.config.ts`) | **vert** | Sortie `dist/`, vérifiée par `pack.cjs` (`dist/index.html`) |
| Dépendances Radix UI | **26 paquets** | La quasi-totalité de shadcn est installée ; plusieurs primitives (carousel, otp, day-picker, resizable, recharts) ne sont utilisées par aucun écran audité |
| Console de build | virtualisée (`log-console.tsx`) | **Bon choix** : un build Gradle produit des milliers de lignes, une liste non virtualisée gèlerait la fenêtre |

**Constat PERF-001 (P3)** — Surface de dépendances non justifiée par l'usage (`recharts`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `react-resizable-panels`, `vaul`). Impact : poids du paquet, surface de mise à jour et de vulnérabilités. Un audit d'usage puis une désinstallation ciblée est du gain net.

**Constat PERF-002 (P3)** — Le Dashboard monte 7 widgets en parallèle, dont plusieurs déclenchent des lectures de système de fichiers via IPC au montage. Sur un dossier contenant beaucoup de projets, cela produit une rafale d'appels IPC synchronisés. Aucun symptôme mesuré ici (bridge mocké), mais c'est le profil de charge qui avait produit les gels observés lors du wizard. À instrumenter avant d'ajouter un huitième widget.

## 11.2 Fiabilité

Points forts vérifiés :
- **`process-manager.cjs`** (137 lignes) : cycle de vie des processus enfants centralisé, annulation (`exec:cancel`) exposée. Un build long est interruptible — c'est essentiel pour la confiance.
- **`BackupService`** : sauvegarde automatique avant build et avant publication, avec **interruption de l'opération si la sauvegarde échoue** (`publish-center.tsx:109-120`). Conforme au principe 4.
- **`durable-store.cjs`** (369 lignes, testé) : persistance de l'état applicatif hors du renderer.
- **Règle de succès de build stricte** (retour 0 + AAB + `jarsigner`). Un faux positif est structurellement empêché.

Points faibles :

**Constat REL-001 (P0)** — Hors Electron, `src/core/bridge/web.ts` renvoie des succès **simulés** (`fakeExec`, `node: "22.0.0 (simulé)"`). Aucun avertissement persistant dans l'UI. C'est un défaut de fiabilité perçue avant d'être un défaut technique : le produit peut afficher un succès qui n'a pas eu lieu. Voir PROD-004 / UX-004.

**Constat REL-002 (P1)** — Aucun mécanisme de mise à jour du produit lui-même : paquet macOS en cible `dir`, non signé, non notarisé, sans installeur ni canal d'auto-update ([01](01-etat-des-lieux.md) BUILD-004). Un défaut découvert chez un utilisateur ne peut pas être corrigé chez lui. C'est un bloqueur de distribution avant d'être un confort.

**Constat REL-003 (P2)** — L'injection dans `app/build.gradle` n'a pas de chemin de retrait exposé ; une interruption laisse le projet utilisateur modifié ([09](09-audit-build-android-publication.md) AND-005). La réversibilité est assurée pour les données d'AppPublisher, pas pour ses effets de bord sur le projet.

## 11.3 Observabilité

C'est le domaine le mieux traité du projet.

| Capacité | État |
| --- | --- |
| Logs fichiers datés | OK — `~/Library/Application Support/AppPublisher/logs/AAAA-MM-JJ.log` (chemin réel confirmé par l'utilisateur) |
| Ouvrir / révéler le log depuis l'UI | OK — `diag:openLog`, `diag:revealLog`, `diag:getLogPath` |
| Lecture incrémentale | OK — `diag:tail` |
| Informations système | OK — `diag:getSysInfo`, `system:detect` |
| **Export d'un bundle de diagnostic** | OK — `diag:exportBundle` |
| **Redaction des secrets et chemins personnels** | OK et **testée** — `electron/diagnostic-redaction.cjs` |
| Journal métier lisible par l'utilisateur | OK — `src/core/journal/logger.ts`, `/journal` |
| Capture des erreurs globales | OK — `src/core/diag/global-errors.ts` |

**Constat OBS-001 (P1)** — La documentation interne mentionnait `~/Library/Logs/AppPublisher/diagnostic.log`, chemin qui **n'existe pas**. Le chemin réel est `~/Library/Application Support/AppPublisher/logs/<date>.log`. Un écart de ce type a directement coûté un cycle de diagnostic complet lors du débogage du gel de démarrage. L'UI expose déjà `diag:getLogPath` : toute documentation ou tout message d'erreur doit citer ce chemin **dynamiquement**, jamais en dur.

**Constat OBS-002 (P2)** — Aucune télémétrie ni remontée d'erreur agrégée (choix cohérent avec la promesse « rien ne quitte votre machine »). Conséquence assumée : la seule source de diagnostic est le bundle exporté volontairement par l'utilisateur. Il faut donc que ce bouton soit **très** visible — aujourd'hui il est dans `/diagnostic`, l'un des quatre écrans d'activité concurrents (UX-001).

## Synthèse

| ID | Constat | Sévérité |
| --- | --- | --- |
| REL-001 | Succès simulés hors Electron, sans avertissement | P0 |
| REL-002 | Aucun canal de mise à jour, paquet non signé/notarisé | P1 |
| OBS-001 | Chemin de log documenté faux ; à exposer dynamiquement | P1 |
| REL-003 | Injection Gradle non réversible côté utilisateur | P2 |
| OBS-002 | Export de diagnostic peu visible (seule source de diagnostic) | P2 |
| PERF-001 | Dépendances UI inutilisées | P3 |
| PERF-002 | Rafale d'IPC au montage du Dashboard | P3 |
