import type { HealthScore } from "@/core/types";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

export function HealthScoreCard({
  score,
  compact,
}: {
  score: HealthScore;
  compact?: boolean;
}) {
  const ring = ringColor(score.grade);
  const dashArray = 2 * Math.PI * 28;
  const dashOffset = dashArray * (1 - score.score / 100);
  return (
    <Card className={cn("p-6 shadow-soft", compact && "p-4")}>
      <div className="flex items-center gap-5">
        <div className="relative h-20 w-20">
          <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
            <circle cx="32" cy="32" r="28" strokeWidth="6" className="stroke-muted" fill="none" />
            <circle
              cx="32"
              cy="32"
              r="28"
              strokeWidth="6"
              strokeLinecap="round"
              className={ring}
              fill="none"
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 500ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold tabular-nums">
            {score.score}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Santé du projet
          </div>
          <div className="text-lg font-semibold">{gradeLabel(score.grade)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{score.summary}</div>
        </div>
      </div>
      {!compact && score.highlights.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm">
          {score.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1.5 inline-block h-2 w-2 rounded-full",
                  h.status === "error" ? "bg-danger" : "bg-warning",
                )}
              />
              <span className="min-w-0">
                <span className="font-medium">{h.label}</span>
                {h.detail && <span className="text-muted-foreground"> — {h.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function gradeLabel(g: HealthScore["grade"]): string {
  return { excellent: "Excellent", good: "Bien", warning: "À surveiller", blocked: "Action requise" }[
    g
  ];
}

function ringColor(g: HealthScore["grade"]): string {
  switch (g) {
    case "excellent":
    case "good":
      return "stroke-success";
    case "warning":
      return "stroke-warning";
    case "blocked":
      return "stroke-danger";
  }
}
