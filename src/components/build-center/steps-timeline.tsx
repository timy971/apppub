import { Check, Loader2, X, AlertTriangle, Circle, Minus } from "lucide-react";
import type { OperationStep, StepStatus } from "@/core/operations/types";
import { Card } from "@/components/ui/card";
import { formatDuration } from "./shared";
import { cn } from "@/lib/utils";

interface Props {
  steps: OperationStep[];
  nowMs: number;
}

export function StepsTimeline({ steps, nowMs }: Props) {
  return (
    <Card className="p-5 shadow-soft">
      <div className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Étapes du build
      </div>
      <ol className="relative space-y-4">
        {steps.map((step, idx) => (
          <li key={step.id} className="flex items-start gap-3">
            <StepIcon status={step.status} />
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <div
                  className={cn(
                    "font-medium",
                    step.status === "pending" && "text-muted-foreground",
                  )}
                >
                  <span className="mr-1.5 text-xs tabular-nums text-muted-foreground/70">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  {step.title}
                </div>
                <StepDuration step={step} nowMs={nowMs} />
              </div>
              {step.description && step.status !== "success" && (
                <div className="mt-0.5 text-xs text-muted-foreground/80">
                  {step.description}
                </div>
              )}
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

function StepDuration({ step, nowMs }: { step: OperationStep; nowMs: number }) {
  if (!step.startedAt) return null;
  const end = step.endedAt ?? nowMs;
  const ms = end - step.startedAt;
  if (ms < 300 && step.status !== "running") return null;
  return (
    <div className="shrink-0 text-xs tabular-nums text-muted-foreground">
      {formatDuration(ms)}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  const base = "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "success":
      return (
        <span className={cn(base, "bg-success/15 text-success")}>
          <Check className="h-3.5 w-3.5" />
        </span>
      );
    case "running":
      return (
        <span className={cn(base, "bg-primary/15 text-primary")}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </span>
      );
    case "error":
      return (
        <span className={cn(base, "bg-danger/15 text-danger")}>
          <X className="h-3.5 w-3.5" />
        </span>
      );
    case "warning":
      return (
        <span className={cn(base, "bg-warning/15 text-warning")}>
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
      );
    case "skipped":
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")}>
          <Minus className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return (
        <span className={cn(base, "text-muted-foreground/50")}>
          <Circle className="h-3.5 w-3.5" />
        </span>
      );
  }
}
