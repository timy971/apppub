# 07 — Electron & sécurité : registre de vulnérabilités

Sévérités : **Critique / Élevé / Moyen / Faible / Informationnel**. Chaque entrée précise s'il s'agit d'une vulnérabilité exploitable, d'une mauvaise pratique, d'un durcissement recommandé ou d'une hypothèse.

## Points forts confirmés (à ne pas régresser)

`CODE` :

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` (`electron/main.cjs:746-748`).
- Navigation verrouillée : `will-navigate`/`will-redirect` limités à l'origine dev ou au `index.html` exact, `will-attach-webview` bloqué, `setWindowOpenHandler` renvoie toujours `deny` (`electron/window-security.cjs:6-35`).
- Permissions : seules les `notifications` sont accordées, et uniquement à des `webContents` connus (`main.cjs:876-883`).
- **Allowlist d'exécution par égalité stricte de tableaux d'arguments** : aucun argument utilisateur n'est jamais concaténé, `shell: false` sur tous les `spawn` (`execution-policy.cjs:6-153`, `main.cjs:939,1400,1673,2037,2156`, `process-manager.cjs:38`). Aucune injection shell trouvée dans tout `electron/`.
- Chemins : `realpathSync` + confinement dans des racines approuvées, refus des racines dangereuses (`/`, home, `/etc`…) (`path-security.cjs:5-21,141-149`).
- Mots de passe hors `argv` : `keytool` via `-storepass:env`, Keychain via stdin (`main.cjs` `runKeytool`, `secrets:set`).
- Écriture atomique du store avec `mode 0o600` (`durable-store.cjs:233-244`), allowlist de clés + plafond 8 Mo.
- CSP stricte en `<meta>` : `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'` (`index.html:6-9`).
- Instance unique, `uncaughtException`/`unhandledRejection` traités sans crash silencieux.

## Registre

### V-00 — `APPPUBLISHER_DEV_URL` transforme un paquet de production en navigateur à privilèges

- **Sévérité : Élevé.** Vulnérabilité exploitable localement.
- `CODE` `main.cjs:63` : `const isDev = !!process.env.APPPUBLISHER_DEV_URL;` puis `main.cjs:773,778` : `if (isDev) win.loadURL(process.env.APPPUBLISHER_DEV_URL)` et `devTools: isDev` (`main.cjs:749`).
- **Scénario** : rien ne vérifie `app.isPackaged`. Lancer l'application installée avec cette variable d'environnement (script, raccourci modifié, `launchctl setenv`, autre programme malveillant déjà présent) fait charger **une URL distante arbitraire** dans une fenêtre qui expose `window.appPublisher` : exécution de commandes de l'allowlist dans les projets approuvés, lecture de fichiers, accès aux profils de signature, Git. Les DevTools sont activés dans la même foulée.
- **Impact** : contournement complet du modèle de confiance renderer↔main.
- **Correction (simple)** : `const isDev = !app.isPackaged && !!process.env.APPPUBLISHER_DEV_URL;` et valider que l'URL est bien `http://localhost:<port>`.
- **Test qui le prouverait** : lancer le `.app` packagé avec `APPPUBLISHER_DEV_URL=https://example.com` et constater le chargement distant. `NV` ici (pas de macOS).

### V-01 — Exécuter un projet importé = exécution de code arbitraire, avertie une seule fois

- **Sévérité : Élevé.** Compromis produit assumé, mais insuffisamment répété.
- `CODE` `main.cjs:472-487` (dialogue de confiance), `project-trust.cjs:35-63` (confiance mise en cache pour toujours), `execution-policy.cjs:16-142` (`npm/yarn/pnpm/bun install|run build`, `npx cap sync/add`, `gradlew bundleRelease`).
- Un `postinstall`, un plugin Gradle ou un `build.gradle` malveillant s'exécute avec tous les droits de l'utilisateur. L'avertissement n'apparaît qu'une fois par projet, jamais avant un build signé.
- **Correction** : re-confirmation explicite avant un build **signé** ; texte clair « approuver ce projet équivaut à exécuter son code ».

### V-02 — Les mots de passe de signature entrent dans l'environnement d'un processus non fiable

- **Sévérité : Élevé.**
- `CODE` `main.cjs` `signing:prepareBuild` construit `ORG_GRADLE_PROJECT_APP_KEYSTORE_PASSWORD` / `..._APP_KEY_PASSWORD` en clair, puis `main.cjs:1400-1404` : `spawn(command, args, { env: { ...process.env, ...safeEnv } })`.
- Un `build.gradle` malveillant lit `System.getenv(...)` — c'est le mécanisme même de la convention `ORG_GRADLE_PROJECT_*`. Par ailleurs `/proc/<pid>/environ` (Linux) ou `ps eww` (macOS, même utilisateur) exposent cet environnement.
- **Atténuations déjà en place** : session à usage unique avec TTL de 2 min et liaison `(senderId, projectPath)` (`signing-session.cjs:20-46`).
- **Correction** : documenter le risque résiduel, éviter le daemon Gradle persistant (`--no-daemon`) pour les builds signés, et re-confirmer la confiance (V-01).

### V-03 — Coffre-fort de mots de passe macOS uniquement → signature impossible ailleurs

- **Sévérité : Élevé** (fonctionnel) / **Moyen** (sécurité).
- `CODE` `main.cjs:2127-2152` : `secretsSupported()` renvoie `available:false` hors `darwin`. `validateStoredKeystore` sort immédiatement sur `keychain-unavailable`, donc `signing:prepareBuild` échoue toujours. Confirmé côté renderer : `keystore-creator.ts:143-152` crée le profil avec `secureStorage:"unavailable"`.
- **Conséquence** : sur Windows/Linux, aucun build signé n'est possible — alors que `pack:win` est configuré (`electron-builder.config.cjs`).
- **Correction** : implémenter DPAPI (Windows) et libsecret/`safeStorage` (Linux), ou à défaut une saisie de mot de passe à chaque build, jamais un repli silencieux `keypass = storepass`.

### V-10 — Redaction des logs heuristique, pas garantie

- **Sévérité : Moyen.** Durcissement.
- `CODE` `diagnostic-redaction.cjs:12-33` : remplacement des valeurs connues + regex sur les noms de clés. Un secret encodé, scindé sur deux lignes, ou produit par un script du projet que AppPublisher n'a jamais manipulé n'est pas masqué.
- **Correction** : avertir explicitement à l'export du bundle de diagnostic ; pour les exécutions de signature, n'exporter que codes de sortie et durées, pas la sortie brute.

### V-04 — DevTools activés par une variable d'environnement

Couvert par V-00. **Correction** : ajouter `!app.isPackaged`.

### V-12 — Pas de migration de schéma du store → perte de données silencieuse au prochain bump

- **Sévérité : Moyen** (fiabilité).
- `CODE` `durable-store.cjs:4,184-193` : `validateDocument` rejette tout `schemaVersion !== 1` et retombe sur `emptyDocument()` (`214-231`). Aucune fonction de migration n'existe. La copie de secours échouera à la même validation.
- **Correction** : écrire les migrations `v1→v2` **avant** de livrer un schéma v2, et quarantaine du fichier plutôt que document vide.

### V-13 — Aucun verrou d'exécution par dossier de projet

- **Sévérité : Moyen** (fiabilité/intégrité).
- `CODE` `process-manager.cjs:87-93` ne déduplique que `(senderId, executionId)`. Deux builds concurrents sur le même `android/` peuvent patcher le même `build.gradle` et se disputer le cache Gradle.
- **Correction** : mutex par `cwd` canonique côté main process.

### V-14 — `resolveJdkTool` retombe sur le `PATH`

- **Sévérité : Faible.** Durcissement.
- `CODE` `main.cjs` : si `JAVA_HOME/bin/keytool` est absent, retour de `"keytool"` nu → résolution par `PATH`, donc plantage possible de binaire (`binary planting`) si un répertoire écrivable précède dans le `PATH`. Le nom de l'outil vient toujours d'un littéral, pas du renderer : pas d'injection.
- **Correction** : exiger `JAVA_HOME` ou une liste de chemins connus, et refuser une résolution ambiguë.

### V-06 — Champs texte libres sans plafond de longueur

- **Sévérité : Faible.** `CODE` `durable-store.cjs` valide les clés autorisées mais pas la longueur de `settings.userName`/`projectsRootPath` ; seul le plafond global de 8 Mo protège. **Correction** : plafonds par champ.

### V-09 — CSP uniquement en `<meta>`

- **Sévérité : Faible.** Durcissement : la renforcer aussi via `session.defaultSession.webRequest.onHeadersReceived` (aucun appel trouvé). Contenu 100 % local, risque réel très faible.

### V-05 / V-11 — Informationnel

`trustedWebContentsIds` (Set d'identifiants mutable) n'est pas atteignable par un attaquant tant que webview et `window.open` sont refusés. L'écriture atomique du store avec nom temporaire prévisible est sans risque (répertoire `userData` propriétaire, `mode 0o600` dès la création).

### SEC-001 — Surface de dépendances excessive

- **Sévérité : Faible.** Durcissement. `CODE` `package.json` embarque en production `embla-carousel-react`, `recharts`, `react-day-picker`, `input-otp`, `vaul`, plusieurs Radix inutilisés, dans une application qui manipule des keystores. Tri à faire après vérification d'usage.

## Priorisation sécurité

| Ordre | Constat | Effort |
| --- | --- | --- |
| 1 | V-00 (`isDev` → `!app.isPackaged`) | Trivial |
| 2 | V-03 (coffre-fort Windows/Linux, ou refus explicite) | Moyen |
| 3 | V-01 (re-confirmation avant build signé) | Faible |
| 4 | V-12 (migrations de schéma) | Faible |
| 5 | V-13 (mutex par projet) | Faible |
| 6 | V-10 / V-14 / V-06 / V-09 / SEC-001 | Faible chacun |
| — | V-02 : risque résiduel inhérent à Gradle, à documenter | — |
