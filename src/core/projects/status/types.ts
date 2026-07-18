import type { Project } from "@/core/types";

export type StatusSeverity = "info" | "warn" | "error";
export type StatusDomain =
  | "identity"
  | "git"
  | "android"
  | "ios"
  | "build"
  | "publishing"
  | "version";

export interface RuleOutcome {
  severity: StatusSeverity;
  message: string;
  hint?: string;
}

export interface RuleFinding extends RuleOutcome {
  id: string;
  domain: StatusDomain;
}

export interface RuleContext {
  project: Project;
}

export interface ProjectRule {
  id: string;
  domain: StatusDomain;
  evaluate(ctx: RuleContext): RuleOutcome | null;
}

export type ProjectStatusLevel = "ready" | "attention" | "blocked";

export interface ProjectStatus {
  level: ProjectStatusLevel;
  label: string;
  findings: RuleFinding[];
  counts: { error: number; warn: number; info: number };
}
