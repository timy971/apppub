import type { ProjectLifecycle } from "@/core/types";
import { cn } from "@/lib/utils";

const CONFIG: Record<ProjectLifecycle, { label: string; className: string }> = {
  development: {
    label: "En développement",
    className: "bg-primary/10 text-primary ring-primary/20",
  },
  published: {
    label: "Publié",
    className: "bg-success/10 text-success ring-success/20",
  },
  archived: {
    label: "Archivé",
    className: "bg-muted text-muted-foreground ring-border",
  },
};

export function ProjectLifecycleBadge({
  lifecycle,
  className,
}: {
  lifecycle: ProjectLifecycle | undefined;
  className?: string;
}) {
  const cfg = CONFIG[lifecycle ?? "development"];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
        cfg.className,
        className,
      )}
    >
      {cfg.label}
    </span>
  );
}

export const LIFECYCLE_OPTIONS: { value: ProjectLifecycle; label: string }[] = [
  { value: "development", label: "En développement" },
  { value: "published", label: "Publié" },
  { value: "archived", label: "Archivé" },
];
