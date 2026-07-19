import { Hammer, Rocket, GitBranch, Timer, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export interface DashboardStats {
  buildsThisWeek: number;
  publishesThisWeek: number;
  versionsThisWeek: number;
  avgBuildMinutes: number | null;
  totalBackups: number;
}

export function StatsStrip({
  stats,
  loading,
}: {
  stats: DashboardStats | null;
  loading: boolean;
}) {
  const items = [
    {
      icon: Hammer,
      label: "Builds",
      hint: "7 derniers jours",
      value: stats?.buildsThisWeek,
    },
    {
      icon: Rocket,
      label: "Publications",
      hint: "7 derniers jours",
      value: stats?.publishesThisWeek,
    },
    {
      icon: GitBranch,
      label: "Versions",
      hint: "7 derniers jours",
      value: stats?.versionsThisWeek,
    },
    {
      icon: Timer,
      label: "Build moyen",
      hint: "sur vos builds",
      value: stats?.avgBuildMinutes == null ? "—" : `${stats.avgBuildMinutes} min`,
    },
    {
      icon: Archive,
      label: "Sauvegardes",
      hint: "au total",
      value: stats?.totalBackups,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label} className="p-4 shadow-soft">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            <it.icon className="h-3.5 w-3.5" />
            {it.label}
          </div>
          {loading || !stats ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <div className="mt-1 text-2xl font-semibold tabular-nums">{it.value ?? 0}</div>
          )}
          <div className="mt-0.5 text-[11px] text-muted-foreground">{it.hint}</div>
        </Card>
      ))}
    </div>
  );
}
