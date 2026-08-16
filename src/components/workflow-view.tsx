import { Check, Loader2, X, AlertTriangle, Circle } from "lucide-react";
import type { Workflow, WorkflowStepStatus } from "@/core/types";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

export function WorkflowView({ workflow }: { workflow: Workflow }) {
  const active = workflow.steps.find((step) => step.status === "running");
  const failed = workflow.steps.find((step) => step.status === "error");
  const completed = workflow.steps.every((step) =>
    ["success", "warning", "skipped"].includes(step.status),
  );
  return (
    <Card className="p-6 shadow-soft" aria-busy={Boolean(active)}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {failed
          ? `${workflow.title} interrompu : ${failed.title}.`
          : active
            ? `${workflow.title} en cours : ${active.title}.`
            : completed
              ? `${workflow.title} terminé.`
              : `${workflow.title} prêt.`}
      </p>
      <div className="mb-4 text-sm font-medium text-muted-foreground">{workflow.title}</div>
      <ol className="space-y-4">
        {workflow.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-3">
            <StepIcon status={step.status} />
            <div className="flex-1 pt-0.5">
              <div
                className={cn("font-medium", step.status === "pending" && "text-muted-foreground")}
              >
                {step.title}
              </div>
              {step.detail && (
                <div className="mt-0.5 text-sm text-muted-foreground">{step.detail}</div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StepIcon({ status }: { status: WorkflowStepStatus }) {
  const base = "mt-0.5 flex h-6 w-6 items-center justify-center rounded-full";
  switch (status) {
    case "success":
      return (
        <span aria-hidden="true" className={cn(base, "bg-success/15 text-success")}>
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    case "running":
      return (
        <span aria-hidden="true" className={cn(base, "bg-primary/15 text-primary")}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      );
    case "error":
      return (
        <span aria-hidden="true" className={cn(base, "bg-danger/15 text-danger")}>
          <X className="h-3.5 w-3.5" />
        </span>
      );
    case "warning":
      return (
        <span aria-hidden="true" className={cn(base, "bg-warning/15 text-warning")}>
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      );
    case "skipped":
      return (
        <span aria-hidden="true" className={cn(base, "bg-muted text-muted-foreground")}>
          –
        </span>
      );
    default:
      return (
        <span aria-hidden="true" className={cn(base, "text-muted-foreground/60")}>
          <Circle className="h-3.5 w-3.5" />
        </span>
      );
  }
}
