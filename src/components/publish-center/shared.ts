import type { Project, HealthCheck, PublishRecord } from "@/core/types";
import type { ProjectStatus, RuleFinding, CockpitTab } from "@/core/projects/status";
import { getAndroidConfig } from "@/core/projects/android-config";

export type PubSeverity = "ok" | "info" | "warn" | "error";

export function severityRank(s: PubSeverity): number {
  return s === "error" ? 3 : s === "warn" ? 2 : s === "info" ? 1 : 0;
}

export function worstOf(sevs: PubSeverity[]): PubSeverity {
  return sevs.reduce<PubSeverity>(
    (acc, s) => (severityRank(s) > severityRank(acc) ? s : acc),
    "ok",
  );
}

export function findingToSev(f: RuleFinding): PubSeverity {
  return f.severity === "error" ? "error" : f.severity === "warn" ? "warn" : "info";
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `il y a ${hr} h`;
  const days = Math.round(hr / 24);
  if (days < 30) return `il y a ${days} j`;
  return formatDate(iso);
}

export function formatSize(bytes?: number): string | undefined {
  if (!bytes) return undefined;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/** Statut lisible d'une plateforme cible. */
export type PlatformKind = "android" | "ios";

export interface PlatformReadiness {
  kind: PlatformKind;
  present: boolean;
  severity: PubSeverity;
  summary: string;
  configLines: { label: string; value: string; missing?: boolean }[];
  findings: RuleFinding[];
  defaultTrack?: string;
  primaryLanguage?: string;
  cockpitTab: CockpitTab;
  cockpitSection?: string;
}

export function buildPlatformReadiness(
  project: Project,
  status: ProjectStatus,
  kind: PlatformKind,
): PlatformReadiness {
  const findings = status.findings.filter((f) => f.domain === kind);
  if (kind === "android") {
    const cfg = getAndroidConfig(project);
    const present = project.detected.hasAndroid;
    const severity = worstOf(findings.map(findingToSev));
    return {
      kind,
      present,
      severity: present ? severity : "info",
      summary: present ? "Google Play" : "Plateforme Android non détectée",
      configLines: [
        { label: "Application ID", value: cfg.applicationId ?? "—", missing: !cfg.applicationId },
        { label: "Package", value: project.packageName ?? "—", missing: !project.packageName },
        { label: "Keystore", value: cfg.keystorePath ?? "—", missing: !cfg.keystorePath },
        { label: "Alias", value: cfg.keystoreAlias ?? "—", missing: !cfg.keystoreAlias },
      ],
      findings,
      defaultTrack: cfg.defaultTrack,
      primaryLanguage: cfg.primaryLanguage,
      cockpitTab: "publishing",
      cockpitSection: "android",
    };
  }
  const ios = project.publishing?.ios;
  const present = project.detected.hasIos || !!ios;
  const severity = worstOf(findings.map(findingToSev));
  return {
    kind,
    present,
    severity: present ? severity : "info",
    summary: present ? "App Store Connect" : "Non configuré pour iOS",
    configLines: [
      { label: "Bundle ID", value: ios?.bundleId ?? "—", missing: !ios?.bundleId },
      { label: "Team ID", value: ios?.teamId ?? "—", missing: !ios?.teamId },
    ],
    findings,
    primaryLanguage: ios?.primaryLanguage,
    cockpitTab: "publishing",
    cockpitSection: "ios",
  };
}

/** Trouve le dernier build réussi correspondant à la version/build courants. */
export function findFreshBuild(
  history: PublishRecord[],
  project: Project,
): PublishRecord | undefined {
  return history.find(
    (h) =>
      h.projectId === project.id &&
      h.kind === "build" &&
      h.outcome === "success" &&
      h.version === project.currentVersion &&
      h.build === project.currentBuild,
  );
}

export function findLastSuccessfulBuild(
  history: PublishRecord[],
  project: Project,
): PublishRecord | undefined {
  return history.find(
    (h) => h.projectId === project.id && h.kind === "build" && h.outcome === "success",
  );
}

export function findLastPublish(
  history: PublishRecord[],
  project: Project,
): PublishRecord | undefined {
  return history.find(
    (h) => h.projectId === project.id && h.kind === "publish" && h.outcome === "success",
  );
}

export interface ChecklistEntry {
  id: string;
  label: string;
  severity: PubSeverity;
  detail: string;
  explanation?: string;
  action?: {
    label: string;
    tab: CockpitTab;
    section?: string;
    field?: string;
  };
}

export interface ChecklistCategory {
  id: string;
  title: string;
  severity: PubSeverity;
  entries: ChecklistEntry[];
}

export interface PreparationScore {
  score: number; // 0..100
  passed: number;
  total: number;
  level: "ready" | "almost" | "blocked";
  label: string;
}

export function computePreparationScore(categories: ChecklistCategory[]): PreparationScore {
  const all = categories.flatMap((c) => c.entries);
  const total = all.length || 1;
  const passed = all.filter((e) => e.severity === "ok").length;
  const errors = all.filter((e) => e.severity === "error").length;
  const warns = all.filter((e) => e.severity === "warn").length;
  const raw = Math.max(
    0,
    Math.round(((passed - errors * 0.5 - warns * 0.25) / total) * 100),
  );
  const level: PreparationScore["level"] =
    errors > 0 ? "blocked" : warns > 0 ? "almost" : "ready";
  const label =
    level === "ready"
      ? "Prêt à publier"
      : level === "almost"
        ? "Presque prêt"
        : "Publication impossible";
  return { score: raw, passed, total, level, label };
}

/** Construit la checklist catégorisée à partir des sources existantes. */
export function buildChecklist(input: {
  project: Project;
  status: ProjectStatus;
  checks: HealthCheck[];
  history: PublishRecord[];
  notes: string;
}): ChecklistCategory[] {
  const { project, status, checks, history, notes } = input;

  const identity: ChecklistEntry[] = statusEntries(status, ["identity", "git"]);
  identity.unshift({
    id: "identity-name",
    label: "Nom de l'application",
    severity: project.name.trim().length > 0 ? "ok" : "error",
    detail:
      project.name.trim().length > 0
        ? project.name
        : "Le nom est requis pour publier.",
    action:
      project.name.trim().length > 0
        ? undefined
        : { label: "Renseigner le nom", tab: "identity", field: "name" },
  });

  const versionCat: ChecklistEntry[] = statusEntries(status, ["version"]);
  versionCat.unshift({
    id: "version-current",
    label: "Numéro de version défini",
    severity: "ok",
    detail: `Version ${project.currentVersion} · build ${project.currentBuild}`,
  });

  const envErrors = checks.filter(
    (c) => c.category === "environment" && c.status === "error",
  );
  const envWarns = checks.filter(
    (c) => c.category === "environment" && c.status === "warning",
  );
  const environment: ChecklistEntry[] = [
    {
      id: "env-tools",
      label: "Environnement de développement prêt",
      severity: envErrors.length ? "error" : envWarns.length ? "warn" : "ok",
      detail: envErrors.length
        ? envErrors[0].detail || "Un outil requis est manquant."
        : envWarns.length
          ? envWarns[0].detail || "Un outil optionnel manque."
          : "Tous les outils requis sont disponibles.",
      explanation:
        "AppPublisher a besoin de Node.js, npm et Java pour construire votre application.",
    },
  ];

  const android: ChecklistEntry[] = statusEntries(status, ["android"]);
  const ios: ChecklistEntry[] = statusEntries(status, ["ios"]);

  const fresh = findFreshBuild(history, project);
  const build: ChecklistEntry[] = statusEntries(status, ["build"]);
  build.unshift({
    id: "build-fresh",
    label: "Fichier d'application prêt",
    severity: fresh ? "ok" : "warn",
    detail: fresh
      ? `Un fichier .aab est disponible pour la version ${project.currentVersion}.`
      : "Aucun fichier .aab n'a encore été construit pour cette version.",
    explanation:
      "Google Play accepte uniquement les fichiers .aab construits pour la version en cours.",
    action: fresh
      ? undefined
      : { label: "Construire", tab: "overview" },
  });

  const notesTrim = notes.trim();
  const notesCat: ChecklistEntry[] = [
    {
      id: "notes-written",
      label: "Notes de version rédigées",
      severity: notesTrim.length === 0 ? "warn" : "ok",
      detail:
        notesTrim.length === 0
          ? "Rédigez quelques lignes pour vos utilisateurs."
          : `${notesTrim.length}/500 caractères`,
      explanation:
        "Les notes apparaissent sur la fiche de votre application dans le store.",
    },
  ];

  const cats: ChecklistCategory[] = [
    catOf("identity", "Identité", identity),
    catOf("version", "Version", versionCat),
    catOf("environment", "Environnement", environment),
    catOf("android", "Android", android),
    catOf("ios", "iOS", ios),
    catOf("build", "Build", build),
    catOf("notes", "Notes de version", notesCat),
  ];

  // Une catégorie vide reste dans la liste (utile pour iOS "aucune règle applicable").
  return cats;
}

function catOf(id: string, title: string, entries: ChecklistEntry[]): ChecklistCategory {
  return {
    id,
    title,
    entries,
    severity: worstOf(entries.map((e) => e.severity)),
  };
}

function statusEntries(status: ProjectStatus, domains: RuleFinding["domain"][]): ChecklistEntry[] {
  return status.findings
    .filter((f) => domains.includes(f.domain))
    .map((f) => ({
      id: f.id,
      label: f.message,
      severity: findingToSev(f),
      detail: f.hint ?? f.explanation ?? "",
      explanation: f.explanation,
      action: f.action
        ? {
            label: f.action.label,
            tab: f.action.tab,
            section: f.action.section,
            field: f.action.field,
          }
        : undefined,
    }));
}
