/**
 * Opérations longues (build, publish, upload…).
 *
 * Le module « operations » offre une couche générique réutilisable pour
 * toutes les opérations longues d'AppPublisher : construction Android,
 * publication Google Play, upload TestFlight, exécution d'un pipeline
 * Fastlane, etc. Le Build Center est le premier consommateur ; les
 * futures intégrations doivent réutiliser cette même primitive sans
 * refonte.
 */

export type OperationStatus =
  | "idle"
  | "running"
  | "success"
  | "error"
  | "cancelled";

export type OperationKind =
  | "build"
  | "publish"
  | "upload"
  | "signing"
  | "validation"
  | "generic";

export type StepStatus =
  | "pending"
  | "running"
  | "success"
  | "warning"
  | "error"
  | "skipped";

export interface OperationStep {
  id: string;
  title: string;
  description?: string;
  status: StepStatus;
  detail?: string;
  startedAt?: number;
  endedAt?: number;
}

export type LogLevel = "info" | "warn" | "error" | "command" | "stdout" | "stderr";

export interface LogLine {
  id: number;
  level: LogLevel;
  message: string;
  at: number;
  stepId?: string;
}

export interface OperationSnapshot {
  id: string;
  kind: OperationKind;
  title: string;
  status: OperationStatus;
  steps: OperationStep[];
  currentStepIndex: number;
  logs: LogLine[];
  startedAt?: number;
  endedAt?: number;
  error?: unknown;
  result?: unknown;
}
