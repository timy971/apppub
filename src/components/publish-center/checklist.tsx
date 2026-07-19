import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  AlertTriangle,
  CircleX,
  Check,
  Info,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Project } from "@/core/types";
import type { ChecklistCategory, ChecklistEntry, PubSeverity } from "./shared";

interface Props {
  project: Project;
  categories: ChecklistCategory[];
}

export function ChecklistCard({ project, categories }: Props) {
  const totalEntries = categories.reduce((n, c) => n + c.entries.length, 0);
  const okEntries = categories.reduce(
    (n, c) => n + c.entries.filter((e) => e.severity === "ok").length,
    0,
  );

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Vérifications</h2>
          <p className="text-xs text-muted-foreground">
            Calculées automatiquement à partir de l'état réel du projet.
          </p>
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {okEntries}/{totalEntries}
        </div>
      </div>
      <ul className="space-y-2">
        {categories.map((cat) => (
          <CategoryRow key={cat.id} project={project} category={cat} />
        ))}
      </ul>
    </Card>
  );
}

function CategoryRow({
  project,
  category,
}: {
  project: Project;
  category: ChecklistCategory;
}) {
  const [open, setOpen] = useState(category.severity !== "ok");
  const okCount = category.entries.filter((e) => e.severity === "ok").length;
  const total = category.entries.length;

  return (
    <li className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-muted/40"
        aria-expanded={open}
      >
        <SeverityBadge severity={category.severity} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{category.title}</div>
          <div className="text-xs text-muted-foreground">
            {total === 0
              ? "Aucun contrôle applicable"
              : `${okCount}/${total} conformes`}
          </div>
        </div>
        <ChevronDown
          className={
            "h-4 w-4 text-muted-foreground transition-transform " +
            (open ? "rotate-180" : "")
          }
        />
      </button>
      {open && total > 0 && (
        <ul className="divide-y border-t bg-muted/20">
          {category.entries.map((entry) => (
            <EntryRow key={entry.id} project={project} entry={entry} />
          ))}
        </ul>
      )}
      {open && total === 0 && (
        <div className="border-t px-4 py-3 text-xs text-muted-foreground">
          Rien à vérifier pour le moment.
        </div>
      )}
    </li>
  );
}

function EntryRow({ project, entry }: { project: Project; entry: ChecklistEntry }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <SeverityIcon severity={entry.severity} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{entry.label}</div>
        {entry.detail && (
          <div className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</div>
        )}
        {entry.explanation && entry.severity !== "ok" && (
          <div className="mt-1 text-xs text-muted-foreground italic">
            {entry.explanation}
          </div>
        )}
      </div>
      {entry.action && entry.severity !== "ok" && (
        <Button asChild size="sm" variant="outline">
          <Link
            to="/projects/$id"
            params={{ id: project.id }}
            search={
              entry.action.field
                ? { tab: entry.action.tab, field: entry.action.field }
                : { tab: entry.action.tab }
            }
          >
            {entry.action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      )}
    </li>
  );
}

function SeverityBadge({ severity }: { severity: PubSeverity }) {
  const cls =
    severity === "error"
      ? "bg-danger/15 text-danger"
      : severity === "warn"
        ? "bg-warning/15 text-warning"
        : severity === "info"
          ? "bg-primary/10 text-primary"
          : "bg-success/15 text-success";
  return (
    <span
      className={"flex h-7 w-7 shrink-0 items-center justify-center rounded-md " + cls}
    >
      <SeverityIcon severity={severity} />
    </span>
  );
}

function SeverityIcon({ severity }: { severity: PubSeverity }) {
  const cls = "h-4 w-4";
  if (severity === "error") return <CircleX className={cls} />;
  if (severity === "warn") return <AlertTriangle className={cls} />;
  if (severity === "info") return <Info className={cls} />;
  return <Check className={cls} />;
}
