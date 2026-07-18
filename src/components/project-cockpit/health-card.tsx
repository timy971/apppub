import { AlertTriangle, Check, CircleX, Heart, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ProjectStatusService } from "@/core/projects/status";
import type {
  ProjectStatus,
  RuleFinding,
  StatusDomain,
} from "@/core/projects/status";
import type { Project } from "@/core/types";
import { DOMAIN_LABELS, worstSeverity, type DomainSeverity } from "./shared";

/**
 * Score global + détail par domaine. Toutes les données proviennent
 * exclusivement de ProjectStatusService (aucune logique parallèle).
 */
export function HealthCard({
  project,
  status,
}: {
  project: Project;
  status: ProjectStatus;
}) {
  const domains: StatusDomain[] = derivedDomains(project);
  const rows = domains.map((domain) => {
    const findings = status.findings.filter((f) => f.domain === domain);
    return { domain, severity: worstSeverity(findings), findings };
  });

  const score = computeScore(rows);
  const dashArray = 2 * Math.PI * 24;
  const dashOffset = dashArray * (1 - score / 100);

  return (
    <Card className="p-6 shadow-soft">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
            <circle
              cx="28"
              cy="28"
              r="24"
              strokeWidth="5"
              className="stroke-muted"
              fill="none"
            />
            <circle
              cx="28"
              cy="28"
              r="24"
              strokeWidth="5"
              strokeLinecap="round"
              className={ringColor(score)}
              fill="none"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 500ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums">
            {score}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
            <Heart className="h-3.5 w-3.5" />
            Santé du projet
          </div>
          <div className="text-base font-semibold">{scoreLabel(score)}</div>
          <div className="text-xs text-muted-foreground">
            {status.counts.error > 0
              ? `${status.counts.error} action(s) requise(s)`
              : status.counts.warn > 0
                ? `${status.counts.warn} point(s) à surveiller`
                : "Tout est au vert."}
          </div>
        </div>
      </div>
      <ul className="mt-5 space-y-1.5">
        <TooltipProvider delayDuration={100}>
          {rows.map((r) => (
            <HealthRow
              key={r.domain}
              label={DOMAIN_LABELS[r.domain]}
              severity={r.severity}
              findings={r.findings}
              project={project}
              domain={r.domain}
            />
          ))}
        </TooltipProvider>
      </ul>
    </Card>
  );
}

function HealthRow({
  label,
  severity,
  findings,
  project,
  domain,
}: {
  label: string;
  severity: DomainSeverity;
  findings: RuleFinding[];
  project: Project;
  domain: StatusDomain;
}) {
  const notApplicable = severity === "ok" && !isApplicable(project, domain);
  const detail =
    findings.length > 0
      ? findings.map((f) => f.hint ?? f.message).join(" — ")
      : notApplicable
        ? "Non applicable à ce projet."
        : "Tout est en ordre.";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <li className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50 cursor-help">
          <SeverityIcon severity={notApplicable ? "info" : severity} />
          <span
            className={
              notApplicable ? "text-muted-foreground" : "text-foreground"
            }
          >
            {label}
          </span>
        </li>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
    </Tooltip>
  );
}

function SeverityIcon({ severity }: { severity: DomainSeverity }) {
  if (severity === "error")
    return <CircleX className="h-4 w-4 text-danger shrink-0" />;
  if (severity === "warn")
    return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
  if (severity === "info")
    return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
  return <Check className="h-4 w-4 text-success shrink-0" />;
}

function derivedDomains(project: Project): StatusDomain[] {
  const base: StatusDomain[] = ["identity", "version", "git", "build"];
  base.push("android");
  if (project.detected.hasIos || project.publishing?.ios) base.push("ios");
  return base;
}

function isApplicable(project: Project, domain: StatusDomain): boolean {
  if (domain === "ios") return project.detected.hasIos || !!project.publishing?.ios;
  return true;
}

function computeScore(rows: { severity: DomainSeverity }[]): number {
  if (rows.length === 0) return 0;
  let earned = 0;
  for (const r of rows) {
    if (r.severity === "ok") earned += 1;
    else if (r.severity === "info") earned += 0.85;
    else if (r.severity === "warn") earned += 0.55;
  }
  return Math.round((earned / rows.length) * 100);
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Bien";
  if (score >= 50) return "À surveiller";
  return "Action requise";
}

function ringColor(score: number): string {
  if (score >= 75) return "stroke-success";
  if (score >= 50) return "stroke-warning";
  return "stroke-danger";
}

// Convenience — permet d'appeler evaluate ailleurs sans imports croisés.
export const evaluateProjectStatus = ProjectStatusService.evaluate;
