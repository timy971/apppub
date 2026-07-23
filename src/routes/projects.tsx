import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  FolderPlus,
  Trash2,
  Search,
  Check,
  Star,
  StarOff,
  FolderOpen,
  Pencil,
  ChevronRight,
} from "lucide-react";
import { ProjectStatusService } from "@/core/projects/status";
import {
  ProjectLifecycleBadge,
  LIFECYCLE_OPTIONS,
} from "@/components/project-lifecycle-badge";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppStore, useProjects, useSettings } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { bridge } from "@/core/bridge";
import type { Project, ProjectDraft, ScannedProject } from "@/core/types";
import { toast } from "sonner";

export const Route = createFileRoute("/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = useProjects();
  const settings = useSettings();
  const navigate = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [path, setPath] = useState("");
  const [rootPath, setRootPath] = useState(settings.projectsRootPath ?? "");
  const [preview, setPreview] = useState<ProjectDraft | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<ScannedProject[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  async function detect() {
    if (!path.trim()) return;
    setDetecting(true);
    try {
      setPreview(await ProjectsService.detectFromPath(path.trim()));
    } finally {
      setDetecting(false);
    }
  }

  async function chooseFolder(setter: (v: string) => void) {
    const chosen = await bridge().projects.chooseFolder();
    if (chosen) setter(chosen);
  }

  function add() {
    if (!preview) return;
    const created = ProjectsService.save(preview);
    AppStore.refreshProjects();
    if (!settings.activeProjectId) AppStore.setActiveProject(created.id);
    toast.success("Projet ajouté", { description: created.name });
    setAddOpen(false);
    setPath("");
    setPreview(null);
  }

  async function scan() {
    if (!rootPath.trim()) return;
    setScanning(true);
    try {
      const res = await ProjectsService.scanFolder(rootPath.trim());
      setScanned(res);
      setSelected(new Set(res.map((r) => r.path)));
      AppStore.updateSettings({ projectsRootPath: rootPath.trim() });
    } finally {
      setScanning(false);
    }
  }

  function importScanned() {
    const toImport = scanned.filter((s) => selected.has(s.path));
    if (!toImport.length) {
      toast.info("Aucun projet sélectionné");
      return;
    }
    let last: Project | null = null;
    for (const sp of toImport) {
      last = ProjectsService.saveFromScan(sp);
    }
    AppStore.refreshProjects();
    if (!settings.activeProjectId && last) AppStore.setActiveProject(last.id);
    toast.success(`${toImport.length} projet(s) importé(s)`);
    setScanOpen(false);
    setScanned([]);
    setSelected(new Set());
  }

  function confirmDelete() {
    if (!toDelete) return;
    ProjectsService.remove(toDelete.id);
    if (settings.activeProjectId === toDelete.id) AppStore.setActiveProject(undefined);
    AppStore.refreshProjects();
    toast.success("Projet retiré");
    setToDelete(null);
  }

  return (
    <div>
      <PageHeader
        title="Vos projets"
        subtitle="Gérez toutes les applications que vous publiez avec AppPublisher."
        help={{
          title: "À propos des projets",
          content:
            "Chaque projet représente une application. Le projet actif est celui sur lequel s'appliquent les actions du tableau de bord.",
        }}
        actions={
          <div className="flex gap-2">
            <Dialog open={scanOpen} onOpenChange={setScanOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Search className="h-4 w-4" />
                  Détecter dans un dossier
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Détecter automatiquement</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Dossier racine</label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="/Users/moi/Projets"
                        value={rootPath}
                        onChange={(e) => setRootPath(e.target.value)}
                        className="font-mono"
                      />
                      <Button variant="secondary" onClick={() => chooseFolder(setRootPath)}>
                        Parcourir
                      </Button>
                    </div>
                  </div>
                  <Button onClick={scan} disabled={!rootPath.trim() || scanning}>
                    {scanning ? "Analyse en cours…" : "Analyser"}
                  </Button>
                  {scanned.length > 0 && (
                    <div className="max-h-72 overflow-auto space-y-2">
                      {scanned.map((sp) => {
                        const on = selected.has(sp.path);
                        return (
                          <button
                            key={sp.path}
                            onClick={() => {
                              const next = new Set(selected);
                              if (on) next.delete(sp.path);
                              else next.add(sp.path);
                              setSelected(next);
                            }}
                            className={
                              "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors " +
                              (on ? "border-primary bg-primary/5" : "hover:bg-accent")
                            }
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary/10">
                              {on ? <Check className="h-4 w-4 text-primary" /> : "📱"}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-medium">{sp.name}</div>
                              <div className="truncate text-xs text-muted-foreground font-mono">
                                {sp.path}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setScanOpen(false)}>
                    Fermer
                  </Button>
                  <Button onClick={importScanned} disabled={scanned.length === 0}>
                    Importer la sélection
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FolderPlus className="h-4 w-4" />
                  Ajouter un projet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Ajouter un projet</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Dossier du projet</label>
                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="/chemin/vers/le/projet"
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        className="font-mono"
                      />
                      <Button variant="secondary" onClick={() => chooseFolder(setPath)}>
                        Parcourir
                      </Button>
                      <Button onClick={detect} disabled={!path.trim() || detecting}>
                        {detecting ? "Détection…" : "Détecter"}
                      </Button>
                    </div>
                  </div>
                  {preview && (
                    <div className="rounded-lg border bg-muted/40 p-4">
                      <div className="text-sm font-medium">{preview.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Version {preview.currentVersion} · Build {preview.currentBuild}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddOpen(false)}>
                    Annuler
                  </Button>
                  <Button onClick={add} disabled={!preview}>
                    Ajouter
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      {projects.length === 0 ? (
        <Card className="p-10 text-center shadow-soft">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <FolderPlus className="h-6 w-6" />
          </div>
          <div className="text-lg font-semibold">Aucun projet pour l'instant</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Commencez par ajouter votre premier projet ou détectez-les automatiquement.
          </div>
        </Card>
      ) : (
        <ProjectsList
          projects={projects}
          activeId={settings.activeProjectId}
          query={query}
          setQuery={setQuery}
          lifecycleFilter={lifecycleFilter}
          setLifecycleFilter={setLifecycleFilter}
          favoritesOnly={favoritesOnly}
          setFavoritesOnly={setFavoritesOnly}
          onOpen={(p) => navigate({ to: "/projects/$id", params: { id: p.id } })}
          onDelete={setToDelete}
        />
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce projet ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le projet « {toDelete?.name} » sera retiré d'AppPublisher. Vos fichiers ne seront pas
              supprimés de votre ordinateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProjectsList({
  projects,
  activeId,
  query,
  setQuery,
  lifecycleFilter,
  setLifecycleFilter,
  favoritesOnly,
  setFavoritesOnly,
  onOpen,
  onDelete,
}: {
  projects: Project[];
  activeId: string | undefined;
  query: string;
  setQuery: (v: string) => void;
  lifecycleFilter: string;
  setLifecycleFilter: (v: string) => void;
  favoritesOnly: boolean;
  setFavoritesOnly: (v: boolean) => void;
  onOpen: (p: Project) => void;
  onDelete: (p: Project) => void;
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter((p) => (favoritesOnly ? p.favorite : true))
      .filter((p) =>
        lifecycleFilter === "all"
          ? true
          : (p.lifecycle ?? "development") === lifecycleFilter,
      )
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.localPath.toLowerCase().includes(q) ||
          (p.packageName ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => {
        if (!!b.favorite !== !!a.favorite) return b.favorite ? 1 : -1;
        return a.name.localeCompare(b.name);
      });
  }, [projects, query, lifecycleFilter, favoritesOnly]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un projet…"
            className="pl-9"
          />
        </div>
        <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les cycles de vie</SelectItem>
            {LIFECYCLE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={favoritesOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setFavoritesOnly(!favoritesOnly)}
        >
          {favoritesOnly ? (
            <Star className="h-4 w-4 fill-current" />
          ) : (
            <StarOff className="h-4 w-4" />
          )}
          Favoris
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground shadow-soft">
          Aucun projet ne correspond à ces filtres.
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              isActive={activeId === p.id}
              onOpen={() => onOpen(p)}
              onDelete={() => onDelete(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  isActive,
  onOpen,
  onDelete,
}: {
  project: Project;
  isActive: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const status = useMemo(() => ProjectStatusService.evaluate(project), [project]);
  const navigate = useNavigate();

  function toggleFavorite(e: React.MouseEvent) {
    e.stopPropagation();
    ProjectsService.update(project.id, { favorite: !project.favorite });
    AppStore.refreshProjects();
  }
  async function openInFinder(e: React.MouseEvent) {
    e.stopPropagation();
    await bridge().shell.openFolder(project.localPath);
  }
  function openIdentity(e: React.MouseEvent) {
    e.stopPropagation();
    navigate({
      to: "/projects/$id",
      params: { id: project.id },
      search: { tab: "identity" },
    });
  }

  return (
    <Card
      className="p-4 shadow-soft transition-colors hover:bg-accent/40 cursor-pointer"
      onClick={onOpen}
    >
      <div className="flex items-center gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl shrink-0">
          {project.logoEmoji ?? "📱"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold truncate">{project.name}</div>
            {isActive && (
              <span className="text-[11px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                Actif
              </span>
            )}
            <ProjectLifecycleBadge lifecycle={project.lifecycle} />
            <ProjectStatusBadge status={status} />
          </div>
          <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
            {project.localPath}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground tabular-nums hidden sm:block">
          v{project.currentVersion} · build {project.currentBuild}
        </div>
        <TooltipProvider delayDuration={200}>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleFavorite}>
                  {project.favorite ? (
                    <Star className="h-4 w-4 fill-current text-warning" />
                  ) : (
                    <StarOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {project.favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={openInFinder}>
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ouvrir le dossier</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={openIdentity}>
                  <Pencil className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Modifier le projet</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onDelete}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Retirer</TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              aria-label="Ouvrir le projet"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </TooltipProvider>
      </div>
    </Card>
  );
}
