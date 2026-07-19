import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/components/project-cockpit/shared";

export interface TodaySummary {
  totalProjects: number;
  attentionCount: number;
  blockedCount: number;
  lastBuildAt?: string;
  nextStep?: string;
}

function greet(name: string): string {
  const first = name || "vous";
  const h = new Date().getHours();
  if (h < 6) return `Bonne nuit ${first}`;
  if (h < 12) return `Bonjour ${first}`;
  if (h < 18) return `Bon après-midi ${first}`;
  return `Bonsoir ${first}`;
}

export function TodayCard({
  userName,
  summary,
  loading,
}: {
  userName: string;
  summary: TodaySummary | null;
  loading: boolean;
}) {
  const now = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <Card className="p-7 shadow-soft">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {now}
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {greet(userName)} 👋
          </h1>
          {loading || !summary ? (
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="h-4 w-72" />
            </div>
          ) : (
            <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground tabular-nums">
                  {summary.totalProjects}
                </span>{" "}
                {summary.totalProjects > 1 ? "projets suivis" : "projet suivi"}
              </li>
              {summary.blockedCount > 0 && (
                <li>
                  <span className="font-medium text-danger tabular-nums">
                    {summary.blockedCount}
                  </span>{" "}
                  {summary.blockedCount > 1 ? "projets bloqués" : "projet bloqué"}
                </li>
              )}
              {summary.attentionCount > 0 && (
                <li>
                  <span className="font-medium text-warning tabular-nums">
                    {summary.attentionCount}
                  </span>{" "}
                  {summary.attentionCount > 1
                    ? "projets nécessitent votre attention"
                    : "projet nécessite votre attention"}
                </li>
              )}
              {summary.blockedCount === 0 && summary.attentionCount === 0 && summary.totalProjects > 0 && (
                <li>Tous vos projets sont en bonne santé.</li>
              )}
              {summary.lastBuildAt && (
                <li>
                  Dernier build{" "}
                  <span className="font-medium text-foreground">
                    {formatRelative(summary.lastBuildAt)}
                  </span>
                </li>
              )}
              {summary.nextStep && (
                <li className="pt-1">
                  Prochaine étape :{" "}
                  <span className="font-medium text-foreground">
                    {summary.nextStep}
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
