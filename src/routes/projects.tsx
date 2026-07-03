import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { FolderPlus, Trash2, Search, Check } from "lucide-react";
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
        <div className="grid gap-3">
          {projects.map((p) => {
            const isActive = settings.activeProjectId === p.id;
            return (
              <Card key={p.id} className="p-4 shadow-soft">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => AppStore.setActiveProject(p.id)}
                    className="flex flex-1 items-center gap-4 min-w-0 text-left"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-xl">
                      {p.logoEmoji ?? "📱"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold truncate">{p.name}</div>
                        {isActive && (
                          <span className="text-[11px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                            Actif
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate font-mono">
                        {p.localPath}
                      </div>
                    </div>
                  </button>
                  <div className="text-right text-xs text-muted-foreground tabular-nums">
                    v{p.currentVersion} · build {p.currentBuild}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(p)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
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
