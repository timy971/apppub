/**
 * AppPublisher — Contrats de domaine.
 * Stables : la Phase 2 étend, sans casser la Phase 1.
 * Les nouveaux champs ajoutés ici sont TOUS optionnels pour préserver
 * la compatibilité avec les données persistées (localStorage).
 */

export type UUID = string;

/* ---------- Projet ---------- */

export interface Project {
  id: UUID;
  name: string;
  logoEmoji?: string;
  localPath: string;
  githubRepo?: string;
  playStoreAppId?: string;
  keystorePath?: string;
  buildCommand?: string;
  currentVersion: string;
  currentBuild: number;
  detected: {
    hasPackageJson: boolean;
    hasAndroid: boolean;
    hasIos: boolean;
    hasVersionJson: boolean;
    hasCapacitorConfig: boolean;
    /** Phase 2 : script officiel de versionning (scripts/version.mjs). */
    hasVersionScript?: boolean;
    /** Phase 2 : présence d'un wrapper Gradle utilisable. */
    hasGradleWrapper?: boolean;
  };
  /** Phase 2 : dernier score global connu (mise en cache). */
  lastHealthScore?: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectDraft = Omit<Project, "id" | "createdAt" | "updatedAt">;

/* ---------- Versioning ---------- */

export type VersionChangeType = "bugfix" | "feature" | "major" | "readonly";

export interface VersionBumpPreview {
  from: string;
  to: string;
  newBuild: number;
  fromBuild: number;
}

/* ---------- Diagnostic ---------- */

export type HealthStatus = "ok" | "warning" | "error" | "unknown";

export interface HealthCheck {
  id: string;
  label: string;
  status: HealthStatus;
  detail?: string;
  /** Phase 2 : catégorie pour regrouper environnement / projet / réseau. */
  category?: "environment" | "project" | "network";
  /** Poids du contrôle dans le score global (défaut 1). */
  weight?: number;
  /** Phase 2 : explication pédagogique déclenchée par le bouton « Pourquoi ? ». */
  why?: string;
}

/* ---------- Historique ---------- */

export type PublishOutcome = "success" | "failure";
export type PublishKind = "version" | "build" | "publish";

export interface PublishRecord {
  id: UUID;
  projectId: UUID;
  projectName: string;
  version: string;
  build: number;
  user: string;
  durationMs: number;
  outcome: PublishOutcome;
  message?: string;
  createdAt: string;
  /** Phase 2 (tous optionnels). */
  kind?: PublishKind;
  artifactPath?: string;
  artifactSizeBytes?: number;
  notes?: string;
}

/* ---------- Workflow Engine ---------- */

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "error"
  | "skipped";

export interface WorkflowStep {
  id: string;
  title: string;
  description?: string;
  status: WorkflowStepStatus;
  detail?: string;
}

export interface Workflow {
  id: string;
  title: string;
  steps: WorkflowStep[];
  currentIndex: number;
  startedAt?: string;
  finishedAt?: string;
}

/* ---------- Journal caché ---------- */

export type JournalLevel = "info" | "warn" | "error" | "command";

export interface JournalEntry {
  id: UUID;
  level: JournalLevel;
  message: string;
  context?: Record<string, unknown>;
  createdAt: string;
  /** Phase 2 — pour les commandes système. */
  command?: string;
  cwd?: string;
  durationMs?: number;
  exitCode?: number;
  tail?: string;
}

/* ---------- Erreurs traduites ---------- */

export interface TranslatedError {
  title: string;
  explanation: string;
  cause?: string;
  solution: string;
  retryable: boolean;
  /** Code d'origine (jamais affiché). Conservé pour le journal. */
  raw?: string;
}

/* ---------- Paramètres ---------- */

export type ThemePreference = "light" | "dark" | "system";
/** Phase 2 : ajout de « discovery » — un mode pédagogique premières utilisations. */
export type ExperienceMode = "discovery" | "assistant" | "expert";
export type Language = "fr" | "en";

export interface Settings {
  userName: string;
  theme: ThemePreference;
  mode: ExperienceMode;
  language: Language;
  projectsRootPath?: string;
  activeProjectId?: UUID;
  onboardingCompleted: boolean;
  contextualHelpEnabled: boolean;
  /** Phase 2 — proposer une sauvegarde avant chaque opération sensible. */
  autoBackupEnabled?: boolean;
}

/* ---------- Phase 2 : Bridge système ---------- */

export interface SystemInfo {
  platform: "darwin" | "win32" | "linux" | "web";
  node?: string;
  npm?: string;
  git?: string;
  java?: string;
  androidStudio?: string;
  androidSdk?: string;
  androidSdkPath?: string;
  androidHome?: string;
  javaHome?: string;
  internet: boolean;
}

export interface ExecOptions {
  cmd: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Timeout en ms. Par défaut 10 min. */
  timeoutMs?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  aborted: boolean;
}

export type ExecLineHandler = (line: {
  stream: "stdout" | "stderr";
  line: string;
}) => void;

export interface DetectedFiles {
  hasPackageJson: boolean;
  hasVersionJson: boolean;
  hasCapacitorConfig: boolean;
  hasAndroid: boolean;
  hasIos: boolean;
  hasVersionScript: boolean;
  hasGradleWrapper: boolean;
  packageName?: string;
  currentVersion?: string;
  currentBuild?: number;
}

export interface ScannedProject {
  path: string;
  name: string;
  detected: DetectedFiles;
}

/* ---------- Phase 2 : Health Score ---------- */

export interface HealthScore {
  /** Note globale sur 100. */
  score: number;
  /** Grade lisible (Excellent, Bien, À surveiller, Bloqué). */
  grade: "excellent" | "good" | "warning" | "blocked";
  /** Nombre de contrôles verts / total. */
  passed: number;
  total: number;
  /** Résumé en une phrase (jamais technique). */
  summary: string;
  /** Détails des points d'attention (max 3). */
  highlights: { label: string; status: HealthStatus; detail?: string }[];
}

/* ---------- Phase 2 : Copilot ---------- */

export type CopilotActionKind =
  | "run-diagnostic"
  | "fix-environment"
  | "bump-version"
  | "build-android"
  | "prepare-publish"
  | "add-project"
  | "select-project"
  | "read-notes";

export interface CopilotSuggestion {
  /** Titre court, orienté action. */
  title: string;
  /** Une phrase d'explication. */
  reason: string;
  /** Détail « pourquoi ? » pédagogique. */
  why?: string;
  /** Action recommandée. */
  action: {
    kind: CopilotActionKind;
    label: string;
    to?: string;
  };
  /** Estimation en minutes pour la prochaine publication. */
  etaMinutes?: number;
  /** Priorité pour tri (1 = critique, 5 = optionnel). */
  priority: 1 | 2 | 3 | 4 | 5;
}

/* ---------- Phase 2 : Checklist intelligente ---------- */

export interface ChecklistItem {
  id: string;
  label: string;
  status: HealthStatus;
  detail?: string;
  /** Action pour corriger l'item si applicable. */
  fix?: { label: string; to?: string; kind?: CopilotActionKind };
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
  readyToPublish: boolean;
}

/* ---------- Phase 2 : Sauvegarde ---------- */

export interface ProjectBackup {
  id: UUID;
  projectId: UUID;
  createdAt: string;
  reason: "version" | "build" | "publish" | "manual";
  /** Fichiers dont l'état a été mémorisé (chemin relatif au projet). */
  files: { path: string; size: number }[];
  /** Emplacement du snapshot sur disque (bridge Electron uniquement). */
  location?: string;
}
