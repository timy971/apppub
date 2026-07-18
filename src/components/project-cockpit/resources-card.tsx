import { Copy, ExternalLink, FolderOpen, GitBranch, Package, ArchiveRestore, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bridge } from "@/core/bridge";
import type { Project } from "@/core/types";
import { toast } from "sonner";

/**
 * Regroupe toutes les actions utiles pour naviguer autour du projet.
 * Chaque action réutilise le bridge existant (aucune API supplémentaire).
 */
export function ResourcesCard({ project }: { project: Project }) {
  const androidPath = `${project.localPath}/android`;
  const backupsPath = `${project.localPath}/.apppublisher-backups`;
  const distPath = `${project.localPath}/android/app/build/outputs`;

  async function open(path: string) {
    try {
      await bridge().shell.openFolder(path);
    } catch {
      toast.error("Impossible d'ouvrir ce dossier");
    }
  }

  function openRepo() {
    if (!project.githubRepo) return;
    const url = toHttpsUrl(project.githubRepo);
    if (url) window.open(url, "_blank", "noopener");
    else copy(project.githubRepo);
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copié dans le presse-papiers");
    } catch {
      toast.error("Copie impossible");
    }
  }

  return (
    <Card className="p-6 shadow-soft">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Ressources</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ResourceButton
          icon={<FolderOpen className="h-4 w-4" />}
          label="Dossier du projet"
          hint={project.localPath}
          onClick={() => open(project.localPath)}
        />
        <ResourceButton
          icon={<Package className="h-4 w-4" />}
          label="Dossier Android"
          hint={project.detected.hasAndroid ? "android/" : "Non détecté"}
          disabled={!project.detected.hasAndroid}
          onClick={() => open(androidPath)}
        />
        <ResourceButton
          icon={<Package className="h-4 w-4" />}
          label="Builds Android"
          hint="android/app/build/outputs"
          disabled={!project.detected.hasAndroid}
          onClick={() => open(distPath)}
        />
        <ResourceButton
          icon={<ArchiveRestore className="h-4 w-4" />}
          label="Sauvegardes"
          hint=".apppublisher-backups"
          onClick={() => open(backupsPath)}
        />
        <ResourceButton
          icon={<GitBranch className="h-4 w-4" />}
          label={
            project.githubRepo
              ? isHttps(project.githubRepo)
                ? "Ouvrir le dépôt"
                : "Copier l'URL du dépôt"
              : "Aucun dépôt Git"
          }
          hint={project.githubRepo ?? "À renseigner dans Identité"}
          disabled={!project.githubRepo}
          trailing={
            project.githubRepo && isHttps(project.githubRepo) ? (
              <ExternalLink className="h-3.5 w-3.5" />
            ) : project.githubRepo ? (
              <Copy className="h-3.5 w-3.5" />
            ) : undefined
          }
          onClick={openRepo}
        />
      </div>
    </Card>
  );
}

function ResourceButton({
  icon,
  label,
  hint,
  onClick,
  disabled,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="h-auto flex-col items-start gap-1 p-3 text-left whitespace-normal"
    >
      <div className="flex w-full items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
        {trailing && <span className="ml-auto text-muted-foreground">{trailing}</span>}
      </div>
      <div className="w-full truncate text-xs font-normal text-muted-foreground">
        {hint}
      </div>
    </Button>
  );
}

function isHttps(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function toHttpsUrl(url: string): string | null {
  if (isHttps(url)) return url;
  // git@github.com:user/repo.git → https://github.com/user/repo
  const m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  return null;
}
