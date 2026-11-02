import { Link } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import type { Project } from "@/core/types";

export function ActiveApplicationContext({ project }: { project: Project }) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
      aria-label={`Application active : ${project.name}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-muted-foreground">Application active :</span>
        <strong className="truncate text-foreground">{project.name}</strong>
      </div>
      <Link
        to="/projects/$id"
        params={{ id: project.id }}
        className="text-xs font-medium text-primary hover:underline"
      >
        Voir sa vue d’ensemble
      </Link>
    </div>
  );
}
