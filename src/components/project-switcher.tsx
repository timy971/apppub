import { useState } from "react";
import { Check, ChevronsUpDown, FolderPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppStore, useActiveProject, useProjects } from "@/core/store/app-store";
import { cn } from "@/lib/utils";

export function ProjectSwitcher({ compact }: { compact?: boolean }) {
  const projects = useProjects();
  const active = useActiveProject();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-accent",
            compact && "justify-center px-1.5",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-base">
            {active?.logoEmoji ?? "📱"}
          </span>
          {!compact && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {active?.name ?? "Aucun projet"}
              </span>
              {active && (
                <span className="block text-[11px] text-muted-foreground">
                  v{active.currentVersion} · build {active.currentBuild}
                </span>
              )}
            </span>
          )}
          {!compact && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <div className="max-h-72 overflow-auto">
          {projects.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground">
              Aucun projet pour l'instant.
            </div>
          ) : (
            projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  AppStore.setActiveProject(p.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-sm">
                  {p.logoEmoji ?? "📱"}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {active?.id === p.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))
          )}
        </div>
        <div className="border-t pt-1">
          <Link
            to="/projects"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <FolderPlus className="h-4 w-4" />
            Gérer les projets
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
