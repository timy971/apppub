import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface GlobalHealth {
  ready: number;
  attention: number;
  blocked: number;
  total: number;
}

export function GlobalHealthCard({
  health,
  loading,
}: {
  health: GlobalHealth | null;
  loading: boolean;
}) {
  return (
    <Card className="p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Santé globale</h3>
        {health && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {health.total} {health.total > 1 ? "projets" : "projet"}
          </span>
        )}
      </div>

      {loading || !health ? (
        <div className="mt-5 space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : health.total === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">
          Ajoutez un projet pour voir sa santé apparaître ici.
        </p>
      ) : (
        <>
          <HealthBar health={health} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat
              label="Prêts"
              value={health.ready}
              className="text-success"
              dotClass="bg-success"
            />
            <Stat
              label="À surveiller"
              value={health.attention}
              className="text-warning"
              dotClass="bg-warning"
            />
            <Stat
              label="Bloqués"
              value={health.blocked}
              className="text-danger"
              dotClass="bg-danger"
            />
          </div>
        </>
      )}
    </Card>
  );
}

function HealthBar({ health }: { health: GlobalHealth }) {
  const total = Math.max(1, health.total);
  const ready = (health.ready / total) * 100;
  const attention = (health.attention / total) * 100;
  const blocked = (health.blocked / total) * 100;
  return (
    <div className="mt-5 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
      {ready > 0 && <div className="bg-success" style={{ width: `${ready}%` }} />}
      {attention > 0 && (
        <div className="bg-warning" style={{ width: `${attention}%` }} />
      )}
      {blocked > 0 && <div className="bg-danger" style={{ width: `${blocked}%` }} />}
    </div>
  );
}

function Stat({
  label,
  value,
  className,
  dotClass,
}: {
  label: string;
  value: number;
  className: string;
  dotClass: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
        <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
        {label}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", className)}>
        {value}
      </div>
    </div>
  );
}
