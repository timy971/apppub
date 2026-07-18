import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FolderOpen,
  Star,
  StarOff,
  CheckCircle2,
  History as HistoryIcon,
  Save,
  Smartphone,
  Apple,
  Package,
  Rocket,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import {
  ProjectLifecycleBadge,
  LIFECYCLE_OPTIONS,
} from "@/components/project-lifecycle-badge";
import { NextActionCard } from "@/components/project-cockpit/next-action-card";
import { HealthCard } from "@/components/project-cockpit/health-card";
import { PublicationCard } from "@/components/project-cockpit/publication-card";
import { TimelineCard } from "@/components/project-cockpit/timeline-card";
import { ActivityCard } from "@/components/project-cockpit/activity-card";
import { ResourcesCard } from "@/components/project-cockpit/resources-card";
import { AppStore, useProjects, useSettings } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { HistoryService } from "@/core/history/service";
import { DiagnosticService } from "@/core/diagnostic/service";
import { ProjectStatusService } from "@/core/projects/status";
import type { ProjectStatus } from "@/core/projects/status";
import {
  getAndroidConfig,
  patchAndroidConfig,
} from "@/core/projects/android-config";
import { bridge } from "@/core/bridge";
import type {
  HealthCheck,
  Project,
  ProjectLifecycle,
  PublishRecord,
} from "@/core/types";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/$id")({
  component: ProjectCockpit,
});

function ProjectCockpit() {
  const { id } = Route.useParams();
  const projects = useProjects();
  const settings = useSettings();
  const navigate = useNavigate();
  const project = projects.find((p) => p.id === id);

  const [tab, setTab] = useState("overview");

  if (!project) {
    return (
      <div>
        <PageHeader
          title="Projet introuvable"
          subtitle="Ce projet n'existe plus dans AppPublisher."
        />
        <Button onClick={() => navigate({ to: "/projects" })}>
          <ArrowLeft className="h-4 w-4" />
          Retour à la liste
        </Button>
      </div>
    );
  }

  const isActive = settings.activeProjectId === project.id;
  const status = useMemo(() => ProjectStatusService.evaluate(project), [project]);

  function update(patch: Partial<Project>) {
    ProjectsService.update(project!.id, patch);
    AppStore.refreshProjects();
  }

  function toggleFavorite() {
    update({ favorite: !project!.favorite });
  }

  async function openFolder() {
    await bridge().shell.openFolder(project!.localPath);
  }

  return (
    <div>
      <div className="flex items-center gap-3 pb-4 text-sm">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Tous les projets
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 pb-6">
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-3xl shrink-0">
            {project.logoEmoji ?? "📱"}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {project.name}
              </h1>
              {isActive && (
                <span className="text-[11px] rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  Actif
                </span>
              )}
              <ProjectLifecycleBadge lifecycle={project.lifecycle} />
              <ProjectStatusBadge status={status} />
            </div>
            <div className="mt-1 text-sm text-muted-foreground font-mono truncate">
              {project.localPath}
            </div>
            {project.description && (
              <div className="mt-2 text-sm max-w-2xl">{project.description}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={toggleFavorite}>
            {project.favorite ? (
              <>
                <Star className="h-4 w-4 fill-current" />
                Favori
              </>
            ) : (
              <>
                <StarOff className="h-4 w-4" />
                Ajouter aux favoris
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={openFolder}>
            <FolderOpen className="h-4 w-4" />
            Ouvrir le dossier
          </Button>
          {!isActive && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                AppStore.setActiveProject(project.id);
                toast.success("Projet actif défini");
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              Définir comme actif
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="identity">Identité</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="publishing">Publication</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab project={project} status={status} />
        </TabsContent>
        <TabsContent value="identity" className="mt-4">
          <IdentityTab project={project} update={update} />
        </TabsContent>
        <TabsContent value="configuration" className="mt-4">
          <ConfigurationTab project={project} update={update} />
        </TabsContent>
        <TabsContent value="publishing" className="mt-4">
          <PublishingTab project={project} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Vue d'ensemble ---------------- */

function OverviewTab({
  project,
  status,
}: {
  project: Project;
  status: ProjectStatus;
}) {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [score, setScore] = useState<HealthScore | null>(null);
  const [backups, setBackups] = useState<ProjectBackup[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await DiagnosticService.run(project);
      if (cancelled) return;
      setChecks(c);
      setScore(HealthScoreService.from(c));
    })();
    setBackups(BackupService.list(project.id));
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const history = useMemo(() => HistoryService.forProject(project.id), [project.id]);
  const lastBuild = history.find(
    (h) => (h.kind === "build" || h.kind === undefined) && h.outcome === "success",
  );
  const lastPublish = history.find(
    (h) => h.kind === "publish" && h.outcome === "success",
  );
  const lastVersion = history.find((h) => h.kind === "version");
  const lastBackup = backups[0];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        {score && <HealthScoreCard score={score} />}

        <Card className="p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Actions rapides</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickAction
              to="/version"
              icon={<Package className="h-5 w-5" />}
              title="Mettre à jour la version"
              desc="Incrémente version et build."
            />
            <QuickAction
              to="/build"
              icon={<Package className="h-5 w-5" />}
              title="Construire l'application"
              desc="Génère un fichier .aab."
            />
            <QuickAction
              to="/publish"
              icon={<Rocket className="h-5 w-5" />}
              title="Préparer la publication"
              desc="Vérifie et met en forme les notes."
            />
          </div>
        </Card>

        <Card className="p-6 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <ClipboardList className="h-4 w-4" />
            Checklist du projet
          </h2>
          {status.findings.length === 0 ? (
            <div className="text-sm text-success flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Toutes les vérifications sont au vert.
            </div>
          ) : (
            <ul className="space-y-2">
              {status.findings.map((f) => (
                <li key={f.id} className="flex items-start gap-2 text-sm">
                  <span
                    className={
                      "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full " +
                      (f.severity === "error"
                        ? "bg-danger"
                        : f.severity === "warn"
                          ? "bg-warning"
                          : "bg-muted-foreground")
                    }
                  />
                  <div>
                    <div className="font-medium">{f.message}</div>
                    {f.hint && (
                      <div className="text-xs text-muted-foreground">{f.hint}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="p-5 shadow-soft">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            État actuel
          </h3>
          <dl className="space-y-2 text-sm">
            <Row label="Version" value={`v${project.currentVersion}`} />
            <Row label="Build" value={`#${project.currentBuild}`} />
            <Row
              label="Dernier build"
              value={
                lastBuild
                  ? `v${lastBuild.version} · ${formatDate(lastBuild.createdAt)}`
                  : "—"
              }
            />
            <Row
              label="Dernière publication"
              value={
                lastPublish
                  ? `v${lastPublish.version} · ${formatDate(lastPublish.createdAt)}`
                  : "—"
              }
            />
            <Row
              label="Dernière version poussée"
              value={
                lastVersion
                  ? `v${lastVersion.version} · ${formatDate(lastVersion.createdAt)}`
                  : "—"
              }
            />
            <Row
              label="Dernière sauvegarde"
              value={lastBackup ? formatDate(lastBackup.createdAt) : "—"}
            />
          </dl>
        </Card>

        <Card className="p-5 shadow-soft">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Environnement
          </h3>
          {checks.length === 0 ? (
            <div className="text-xs text-muted-foreground">Analyse en cours…</div>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {checks
                .filter((c) => c.category === "environment")
                .slice(0, 6)
                .map((c) => (
                  <li key={c.id} className="flex items-center gap-2">
                    <span
                      className={
                        "inline-block h-2 w-2 rounded-full " +
                        (c.status === "ok"
                          ? "bg-success"
                          : c.status === "warning"
                            ? "bg-warning"
                            : "bg-danger")
                      }
                    />
                    <span>{c.label}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

function QuickAction({
  to,
  icon,
  title,
  desc,
}: {
  to: "/version" | "/build" | "/publish";
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-accent"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </Link>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ---------------- Identité ---------------- */

function IdentityTab({
  project,
  update,
}: {
  project: Project;
  update: (patch: Partial<Project>) => void;
}) {
  return (
    <Card className="p-6 shadow-soft space-y-5 max-w-3xl">
      <InlineText
        label="Nom du projet"
        value={project.name}
        onSave={(name) => {
          if (!name.trim()) {
            toast.error("Le nom ne peut pas être vide");
            return;
          }
          update({ name: name.trim() });
        }}
      />
      <InlineText
        label="Icône (emoji)"
        value={project.logoEmoji ?? ""}
        placeholder="📱"
        maxLength={4}
        onSave={(v) => update({ logoEmoji: v.trim() || undefined })}
      />
      <InlineTextarea
        label="Description"
        value={project.description ?? ""}
        placeholder="Une phrase qui décrit ce projet…"
        onSave={(v) => update({ description: v.trim() || undefined })}
      />
      <div>
        <Label>Dossier local</Label>
        <div className="mt-1.5 flex gap-2">
          <Input value={project.localPath} readOnly className="font-mono" />
          <Button
            variant="secondary"
            onClick={() => bridge().shell.openFolder(project.localPath)}
          >
            <FolderOpen className="h-4 w-4" />
            Ouvrir
          </Button>
        </div>
      </div>
      <InlineText
        label="Dépôt Git"
        value={project.githubRepo ?? ""}
        placeholder="git@github.com:vous/depot.git"
        onSave={(v) => update({ githubRepo: v.trim() || undefined })}
      />
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Cycle de vie</Label>
          <Select
            value={project.lifecycle ?? "development"}
            onValueChange={(v) => update({ lifecycle: v as ProjectLifecycle })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Utilisé pour filtrer vos projets dans le tableau de bord.
          </p>
        </div>
        <div>
          <Label>Favori</Label>
          <div className="mt-1.5">
            <Button
              variant="outline"
              onClick={() => update({ favorite: !project.favorite })}
            >
              {project.favorite ? (
                <>
                  <Star className="h-4 w-4 fill-current" />
                  Retirer des favoris
                </>
              ) : (
                <>
                  <StarOff className="h-4 w-4" />
                  Ajouter aux favoris
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Configuration ---------------- */

function ConfigurationTab({
  project,
  update,
}: {
  project: Project;
  update: (patch: Partial<Project>) => void;
}) {
  return (
    <Card className="p-6 shadow-soft space-y-5 max-w-3xl">
      <InlineText
        label="Nom de package"
        value={project.packageName ?? ""}
        placeholder="com.exemple.monapp"
        onSave={(v) => update({ packageName: v.trim() || undefined })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Version actuelle</Label>
          <Input value={project.currentVersion} readOnly className="mt-1.5 font-mono" />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Modifiée depuis l'onglet Version.
          </p>
        </div>
        <div>
          <Label>Build actuel</Label>
          <Input
            value={String(project.currentBuild)}
            readOnly
            className="mt-1.5 font-mono"
          />
        </div>
      </div>
      <InlineText
        label="Commande de build personnalisée"
        value={project.buildCommand ?? ""}
        placeholder="npm run build"
        onSave={(v) => update({ buildCommand: v.trim() || undefined })}
      />
      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        Ces valeurs restent de la configuration. L'historique des exécutions
        est conservé dans l'onglet Historique.
      </div>
    </Card>
  );
}

/* ---------------- Publication ---------------- */

function PublishingTab({ project }: { project: Project }) {
  return (
    <div className="space-y-4">
      <AndroidSection project={project} />
      <IosSection project={project} />
    </div>
  );
}

function AndroidSection({ project }: { project: Project }) {
  const cfg = getAndroidConfig(project);
  function save(patch: Partial<ReturnType<typeof getAndroidConfig>>) {
    const merged = patchAndroidConfig(project, patch);
    ProjectsService.update(project.id, merged);
    AppStore.refreshProjects();
  }
  async function chooseKeystore() {
    const chosen = await bridge().projects.chooseFolder();
    if (chosen) save({ keystorePath: chosen });
  }
  return (
    <Card className="p-6 shadow-soft max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Android</h2>
        {!project.detected.hasAndroid && (
          <span className="text-[11px] rounded-full bg-warning/10 px-2 py-0.5 text-warning ring-1 ring-warning/20">
            Plateforme non détectée
          </span>
        )}
      </div>
      <div className="space-y-4">
        <InlineText
          label="Identifiant d'application"
          value={cfg.applicationId ?? ""}
          placeholder="com.exemple.monapp"
          onSave={(v) => save({ applicationId: v.trim() || undefined })}
        />
        <div>
          <Label>Clé de signature (keystore)</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={cfg.keystorePath ?? ""}
              onChange={(e) => save({ keystorePath: e.target.value || undefined })}
              placeholder="/chemin/vers/keystore.jks"
              className="font-mono"
            />
            <Button variant="secondary" onClick={chooseKeystore}>
              Parcourir
            </Button>
          </div>
        </div>
        <InlineText
          label="Alias de la clé"
          value={cfg.keystoreAlias ?? ""}
          placeholder="upload"
          onSave={(v) => save({ keystoreAlias: v.trim() || undefined })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Piste par défaut</Label>
            <Select
              value={cfg.defaultTrack ?? "internal"}
              onValueChange={(v) =>
                save({ defaultTrack: v as NonNullable<typeof cfg.defaultTrack> })
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Test interne</SelectItem>
                <SelectItem value="alpha">Alpha fermée</SelectItem>
                <SelectItem value="beta">Bêta ouverte</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <InlineText
            label="Langue principale"
            value={cfg.primaryLanguage ?? ""}
            placeholder="fr-FR"
            onSave={(v) => save({ primaryLanguage: v.trim() || undefined })}
          />
        </div>
      </div>
    </Card>
  );
}

function IosSection({ project }: { project: Project }) {
  const cfg = project.publishing?.ios ?? {};
  function save(patch: Partial<typeof cfg>) {
    const nextIos = { ...cfg, ...patch };
    ProjectsService.update(project.id, {
      publishing: { ...(project.publishing ?? {}), ios: nextIos },
    });
    AppStore.refreshProjects();
  }
  return (
    <Card className="p-6 shadow-soft max-w-3xl">
      <div className="mb-4 flex items-center gap-2">
        <Apple className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">iOS</h2>
        <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground ring-1 ring-border">
          Configuration disponible — publication à venir
        </span>
      </div>
      <div className="space-y-4">
        <InlineText
          label="Bundle identifier"
          value={cfg.bundleId ?? ""}
          placeholder="com.exemple.monapp"
          onSave={(v) => save({ bundleId: v.trim() || undefined })}
        />
        <InlineText
          label="Team ID"
          value={cfg.teamId ?? ""}
          placeholder="ABCDE12345"
          onSave={(v) => save({ teamId: v.trim() || undefined })}
        />
        <InlineText
          label="Langue principale"
          value={cfg.primaryLanguage ?? ""}
          placeholder="fr-FR"
          onSave={(v) => save({ primaryLanguage: v.trim() || undefined })}
        />
      </div>
    </Card>
  );
}

/* ---------------- Historique ---------------- */

function HistoryTab({ project }: { project: Project }) {
  const records = useMemo(() => HistoryService.forProject(project.id), [project.id]);
  if (records.length === 0) {
    return (
      <Card className="p-10 text-center shadow-soft">
        <HistoryIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <div className="font-medium">Aucun événement pour ce projet</div>
        <div className="text-sm text-muted-foreground mt-1">
          L'historique s'enrichira dès votre première mise à jour de version, build
          ou publication.
        </div>
      </Card>
    );
  }
  return (
    <Card className="p-2 shadow-soft">
      <ul className="divide-y">
        {records.map((r) => (
          <HistoryRow key={r.id} record={r} />
        ))}
      </ul>
    </Card>
  );
}

function HistoryRow({ record }: { record: PublishRecord }) {
  const kindLabel: Record<string, string> = {
    version: "Version",
    build: "Build",
    publish: "Publication",
  };
  return (
    <li className="flex items-center gap-4 p-4">
      <div
        className={
          "flex h-9 w-9 items-center justify-center rounded-full " +
          (record.outcome === "success"
            ? "bg-success/10 text-success"
            : "bg-danger/10 text-danger")
        }
      >
        {record.kind === "publish" ? (
          <Rocket className="h-4 w-4" />
        ) : record.kind === "build" ? (
          <Package className="h-4 w-4" />
        ) : (
          <Save className="h-4 w-4" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {kindLabel[record.kind ?? "version"] ?? "Événement"} · v{record.version} ·
          build {record.build}
        </div>
        {record.message && (
          <div className="text-xs text-muted-foreground truncate">
            {record.message}
          </div>
        )}
      </div>
      <div className="text-xs text-muted-foreground tabular-nums">
        {formatDate(record.createdAt)}
      </div>
    </li>
  );
}

/* ---------------- Édition inline ---------------- */

function InlineText({
  label,
  value,
  placeholder,
  maxLength,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const dirty = local !== value;
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1.5 flex gap-2">
        <Input
          value={local}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => {
            if (dirty) onSave(local);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") setLocal(value);
          }}
        />
        {dirty && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onSave(local)}
          >
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        )}
      </div>
    </div>
  );
}

function InlineTextarea({
  label,
  value,
  placeholder,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const dirty = local !== value;
  return (
    <div>
      <Label>{label}</Label>
      <Textarea
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (dirty) onSave(local);
        }}
        rows={3}
        className="mt-1.5"
      />
    </div>
  );
}
