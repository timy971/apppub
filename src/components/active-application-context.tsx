import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, GitBranch, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { GitProjectStatus } from "@/core/bridge/types";
import { ProjectsService } from "@/core/projects/service";
import { AppStore } from "@/core/store/app-store";
import type { Project } from "@/core/types";

export function ActiveApplicationContext({ project }: { project: Project }) {
  const [gitStatus, setGitStatus] = useState<GitProjectStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const managedGit = project.source?.type === "git";

  async function checkGit(silent = false) {
    if (!managedGit) return null;
    setChecking(true);
    try {
      const status = await ProjectsService.gitStatus(project.id);
      setGitStatus(status);
      AppStore.refreshProjects();
      return status;
    } catch (error) {
      if (!silent) {
        toast.error("État du code indisponible", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
      return null;
    } finally {
      setChecking(false);
    }
  }

  async function updateCode() {
    if (!managedGit) return;
    let status = gitStatus;
    if (!status) status = await checkGit();
    if (!status) return;

    const dirty = status.workingTree === "dirty";
    if (dirty) {
      const confirmed = window.confirm(
        "Des modifications locales sont présentes.\n\nAppPublisher va les sauvegarder séparément, puis mettre le projet à jour depuis la branche distante. Continuer ?",
      );
      if (!confirmed) return;
    }

    setSyncing(true);
    try {
      const next = await ProjectsService.syncGit(project.id, dirty);
      setGitStatus(next);
      AppStore.refreshProjects();
      toast.success(
        status.relation === "up-to-date" && !dirty ? "Le code est déjà à jour" : "Code mis à jour",
        {
          description: `${next.branch} · ${next.shortSha}`,
        },
      );
    } catch (error) {
      toast.error("Mise à jour du code bloquée", {
        description: error instanceof Error ? error.message : String(error),
        duration: 10_000,
      });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!managedGit) {
      setGitStatus(null);
      return;
    }
    void checkGit(true);
    // Le changement de projet suffit à relancer la vérification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, managedGit]);

  const status = gitStatus;
  const codeOutdated = status?.relation === "behind" || status?.relation === "diverged";
  const dirty = status?.workingTree === "dirty";

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm"
      aria-label={`Application active : ${project.name}`}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Application active :</span>
          <strong className="truncate text-foreground">{project.name}</strong>
        </div>

        {managedGit && (
          <div className="flex items-center gap-2 text-xs">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-mono">{status?.branch ?? project.source?.branch ?? "main"}</span>
            {checking && !status ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Vérification…
              </span>
            ) : codeOutdated ? (
              <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-3.5 w-3.5" />
                Mise à jour disponible
              </span>
            ) : dirty ? (
              <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                <TriangleAlert className="h-3.5 w-3.5" />
                Modifications locales
              </span>
            ) : status ? (
              <span className="text-success">
                ✓ Code à jour · <span className="font-mono">{status.shortSha}</span>
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {managedGit && (
          <>
            <Button
              size="sm"
              variant={codeOutdated || dirty ? "default" : "outline"}
              onClick={() => void updateCode()}
              disabled={checking || syncing}
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {dirty ? "Sauvegarder et mettre à jour" : "Mettre à jour le code"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void checkGit()}
              disabled={checking || syncing}
              aria-label="Vérifier si une mise à jour du code est disponible"
            >
              {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vérifier"}
            </Button>
          </>
        )}
        <Link
          to="/projects/$id"
          params={{ id: project.id }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Voir sa vue d’ensemble
        </Link>
      </div>
    </div>
  );
}
