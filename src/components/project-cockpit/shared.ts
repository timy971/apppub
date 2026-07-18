import type { RuleFinding, StatusDomain } from "@/core/projects/status";

export const DOMAIN_LABELS: Record<StatusDomain, string> = {
  identity: "Identité",
  version: "Version",
  git: "Dépôt Git",
  android: "Android",
  ios: "iOS",
  build: "Build",
  publishing: "Publication",
};

export type DomainSeverity = "ok" | "info" | "warn" | "error";

export function worstSeverity(findings: RuleFinding[]): DomainSeverity {
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  if (findings.some((f) => f.severity === "info")) return "info";
  return "ok";
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
