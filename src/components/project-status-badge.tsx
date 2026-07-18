import type { ProjectStatus, ProjectStatusLevel } from "@/core/projects/status";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CLASSES: Record<ProjectStatusLevel, string> = {
  ready: "bg-success/10 text-success ring-success/20",
  attention: "bg-warning/10 text-warning ring-warning/20",
  blocked: "bg-danger/10 text-danger ring-danger/20",
};

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const top = status.findings.slice(0, 3);
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        CLASSES[status.level],
        className,
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          status.level === "ready"
            ? "bg-success"
            : status.level === "attention"
              ? "bg-warning"
              : "bg-danger",
        )}
      />
      {status.label}
    </span>
  );
  if (top.length === 0) return badge;
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <ul className="space-y-1 text-xs">
            {top.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.message}</span>
                {f.hint && <span className="text-muted-foreground"> — {f.hint}</span>}
              </li>
            ))}
            {status.findings.length > top.length && (
              <li className="text-muted-foreground">
                +{status.findings.length - top.length} autre(s)
              </li>
            )}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
