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
import { ProfilesStore as SigningProfilesStore } from "@/features/android-signing";
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
import { PlanCard } from "@/components/project-cockpit/plan-card";
import { SourceBadge } from "@/components/project-cockpit/source-badge";
import { DiscoveryHint } from "@/components/discovery-hint";
import { ExpertDetails, ExpertRow } from "@/components/expert-details";
import { CopilotService } from "@/core/copilot/service";
import { BackupService } from "@/core/backup/service";
import { HealthCard } from "@/components/project-cockpit/health-card";
import { PublicationCard } from "@/components/project-cockpit/publication-card";
import { TimelineCard } from "@/components/project-cockpit/timeline-card";
import { ActivityCard } from "@/components/project-cockpit/activity-card";
import { ResourcesCard } from "@/components/project-cockpit/resources-card";
import {
  CockpitNavProvider,
  useCockpitNav,
} from "@/components/project-cockpit/cockpit-nav";
import { AppStore, useProjects, useSettings } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { HistoryService } from "@/core/history/service";
import { DiagnosticService } from "@/core/diagnostic/service";
import { ProjectStatusService } from "@/core/projects/status";
import type { CockpitTab, ProjectStatus } from "@/core/projects/status";
import {
  getAndroidConfig,
  patchAndroidConfig,
} from "@/core/projects/android-config";
import { sourceOf, type FieldSource, type TrackedFieldKey } from "@/core/projects/sources";
import {
  validateApplicationId,
  validateAppleTeamId,
  validateBranchName,
  validateBundleId,
  validateGitUrl,
  validatePackageName,
  type FieldValidator,
} from "@/core/projects/validators";
import { bridge } from "@/core/bridge";
import type {
  HealthCheck,
  Project,
  ProjectLifecycle,
  PublishRecord,
} from "@/core/types";
import { toast } from "sonner";

const COCKPIT_TABS: CockpitTab[] = [
  "overview",
  "identity",
  "configuration",
  "publishing",
  "history",
];

interface CockpitSearch {
  tab?: CockpitTab;
  field?: string;
}

export const Route = createFileRoute("/projects/$id")({
  validateSearch: (search: Record<string, unknown>): CockpitSearch => {
    const rawTab =
      typeof search.tab === "string" ? (search.tab as string) : undefined;
    const tab =
      rawTab && (COCKPIT_TABS as string[]).includes(rawTab)
        ? (rawTab as CockpitTab)
        : undefined;
    const field =
      typeof search.field === "string" && search.field.length > 0
        ? (search.field as string)
        : undefined;
    const out: CockpitSearch = {};
    if (tab) out.tab = tab;
    if (field) out.field = field;
    return out;
  },
  component: ProjectCockpitRoute,
});

function ProjectCockpitRoute() {
  const { tab, field } = Route.useSearch();
  const { id } = Route.useParams();
  const navigate = useNavigate();

  // Purge le paramètre `field` de l'URL une fois le focus consommé, sans
  // toucher au `tab` : un refresh manuel ne réactivera pas le halo.
  const clearField = () => {
    navigate({
      to: "/projects/$id",
      params: { id },
      search: tab ? { tab } : {},
      replace: true,
    });
  };

  return (
    <CockpitNavProvider
      initialTab={tab}
      initialField={field}
      onFieldConsumed={clearField}
    >
      <ProjectCockpit />
    </CockpitNavProvider>
  );
}

function ProjectCockpit() {
  const { id } = Route.useParams();
  const projects = useProjects();
  const settings = useSettings();
  const navigate = useNavigate();
  const nav = useCockpitNav();
  const project = projects.find((p) => p.id === id);

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

  function updateProject(
    patch: Partial<Project>,
    touched: TrackedFieldKey[],
  ) {
    ProjectsService.update(project!.id, patch, { touched });
    AppStore.refreshProjects();
  }

  function toggleFavorite() {
    updateProject({ favorite: !project!.favorite }, []);
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

      <Tabs value={nav.tab} onValueChange={(v) => nav.setTab(v as CockpitTab)}>
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
          <IdentityTab project={project} update={updateProject} />
        </TabsContent>
        <TabsContent value="configuration" className="mt-4">
          <ConfigurationTab project={project} update={updateProject} />
        </TabsContent>
        <TabsContent value="publishing" className="mt-4">
          <PublishingTab project={project} update={updateProject} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab project={project} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Vue d'ensemble (cockpit) ---------------- */

function OverviewTab({
  project,
  status,
}: {
  project: Project;
  status: ProjectStatus;
}) {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [checksLoading, setChecksLoading] = useState(true);
  const { refreshKey } = useCockpitNav();
  const history: PublishRecord[] = useMemo(
    () => HistoryService.forProject(project.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id, refreshKey],
  );

  useEffect(() => {
    let cancelled = false;
    setChecksLoading(true);
    (async () => {
      const c = await DiagnosticService.run(project);
      if (cancelled) return;
      setChecks(c);
      setChecksLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  const plan = useMemo(
    () =>
      CopilotService.plan({
        project,
        checks,
        history,
        backups: BackupService.list(project.id),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, checks, history, refreshKey],
  );

  return (
    <div className="space-y-4">
      <PlanCard plan={plan} />
      <NextActionCard
        project={project}
        status={status}
        checks={checks}
        history={history}
        loading={checksLoading}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PublicationCard project={project} status={status} />
          <TimelineCard project={project} />
        </div>
        <div className="space-y-4">
          <HealthCard project={project} status={status} />
          <ActivityCard project={project} />
          <ResourcesCard project={project} />
        </div>
      </div>
    </div>
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

type UpdateFn = (patch: Partial<Project>, touched: TrackedFieldKey[]) => void;

/* ---------------- Identité ---------------- */

function IdentityTab({
  project,
  update,
}: {
  project: Project;
  update: UpdateFn;
}) {
  return (
    <Card className="p-6 shadow-soft space-y-5 max-w-3xl">
      <DiscoveryHint title="Deux noms, deux usages">
        Le <strong>nom d'affichage</strong> est celui qui apparaît partout
        dans AppPublisher. Le <strong>nom technique</strong> vient de votre
        fichier <code>package.json</code> et ne peut pas être modifié ici.
      </DiscoveryHint>

      <InlineText
        fieldKey="name"
        source={sourceOf(project, "name")}
        label="Nom de l'application"
        value={project.name}
        onSave={(name) => {
          if (!name.trim()) {
            toast.error("Le nom ne peut pas être vide");
            return;
          }
          update({ name: name.trim() }, ["name"]);
        }}
      />
      <p className="-mt-3 text-xs text-muted-foreground">
        C'est ce nom qui est affiché partout dans AppPublisher.
      </p>

      {project.technicalName && (
        <div>
          <Label>Nom technique</Label>
          <Input
            value={project.technicalName}
            readOnly
            className="mt-1.5 font-mono"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Nom interne (issu du package.json). Utilisé uniquement par les
            opérations techniques — non modifiable ici.
          </p>
        </div>
      )}

      <InlineText
        fieldKey="logoEmoji"
        source={sourceOf(project, "logoEmoji")}
        label="Icône (emoji)"
        value={project.logoEmoji ?? ""}
        placeholder="📱"
        maxLength={4}
        onSave={(v) => update({ logoEmoji: v.trim() || undefined }, ["logoEmoji"])}
      />

      <InlineTextarea
        fieldKey="description"
        source={sourceOf(project, "description")}
        label="Description"
        value={project.description ?? ""}
        placeholder="Une phrase qui décrit ce projet…"
        onSave={(v) =>
          update({ description: v.trim() || undefined }, ["description"])
        }
      />

      <InlineTextarea
        fieldKey="notes"
        source={sourceOf(project, "notes")}
        label="Notes privées"
        value={project.notes ?? ""}
        placeholder="Remarques, points d'attention, aide-mémoire…"
        onSave={(v) => update({ notes: v.trim() || undefined }, ["notes"])}
      />
      <p className="-mt-3 text-xs text-muted-foreground">
        Ces notes ne sont ni publiées ni synchronisées. Elles restent locales.
      </p>

      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>Cycle de vie</Label>
          <Select
            value={project.lifecycle ?? "development"}
            onValueChange={(v) =>
              update({ lifecycle: v as ProjectLifecycle }, [])
            }
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
              onClick={() => update({ favorite: !project.favorite }, [])}
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
  update: UpdateFn;
}) {
  return (
    <Card className="p-6 shadow-soft space-y-5 max-w-3xl">
      <DiscoveryHint title="Configuration du dépôt et du build">
        Ces informations permettent à AppPublisher de retrouver votre code
        et d'exécuter les bonnes commandes. Elles peuvent être détectées
        automatiquement ou saisies manuellement.
      </DiscoveryHint>

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
        <p className="mt-1.5 text-xs text-muted-foreground">
          Chemin racine du projet. Non modifiable ici — recréez le projet
          pour pointer vers un autre dossier.
        </p>
      </div>

      <InlineText
        fieldKey="githubRepo"
        source={sourceOf(project, "githubRepo")}
        label="Dépôt Git"
        value={project.githubRepo ?? ""}
        placeholder="git@github.com:vous/depot.git"
        validate={validateGitUrl}
        onSave={(v) =>
          update({ githubRepo: v.trim() || undefined }, ["githubRepo"])
        }
      />

      <InlineText
        fieldKey="defaultBranch"
        source={sourceOf(project, "defaultBranch")}
        label="Branche par défaut"
        value={project.defaultBranch ?? ""}
        placeholder="main"
        validate={validateBranchName}
        onSave={(v) =>
          update({ defaultBranch: v.trim() || undefined }, ["defaultBranch"])
        }
      />

      <InlineText
        fieldKey="packageName"
        source={sourceOf(project, "packageName")}
        label="Nom de package"
        value={project.packageName ?? ""}
        placeholder="com.exemple.monapp"
        validate={validatePackageName}
        onSave={(v) =>
          update({ packageName: v.trim() || undefined }, ["packageName"])
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div data-cockpit-field="currentVersion">
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
        fieldKey="buildCommand"
        source={sourceOf(project, "buildCommand")}
        label="Commande de build personnalisée"
        value={project.buildCommand ?? ""}
        placeholder="npm run build"
        onSave={(v) =>
          update({ buildCommand: v.trim() || undefined }, ["buildCommand"])
        }
      />

      <ExpertDetails title="Chemins & valeurs brutes">
        <ExpertRow label="Chemin absolu" value={project.localPath} />
        <ExpertRow label="Package.json" value={project.technicalName} />
        <ExpertRow label="Version" value={project.currentVersion} />
        <ExpertRow label="Build" value={String(project.currentBuild)} />
        <ExpertRow label="Repo Git" value={project.githubRepo} />
        <ExpertRow label="Branche" value={project.defaultBranch} />
      </ExpertDetails>

      <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        Ces valeurs restent de la configuration. L'historique des exécutions
        est conservé dans l'onglet Historique.
      </div>
    </Card>
  );
}

/* ---------------- Publication ---------------- */

function PublishingTab({
  project,
  update,
}: {
  project: Project;
  update: UpdateFn;
}) {
  return (
    <div className="space-y-4">
      <AndroidSection project={project} update={update} />
      <IosSection project={project} update={update} />
    </div>
  );
}

function AndroidSection({
  project,
  update,
}: {
  project: Project;
  update: UpdateFn;
}) {
  const cfg = getAndroidConfig(project);
  function save(
    patch: Partial<ReturnType<typeof getAndroidConfig>>,
    touched: TrackedFieldKey[],
  ) {
    const merged = patchAndroidConfig(project, patch);
    update(merged, touched);
  }
  async function chooseKeystore() {
    const chosen = await bridge().projects.chooseFolder();
    if (chosen) save({ keystorePath: chosen }, ["android.keystorePath"]);
  }
  return (
    <Card className="p-6 shadow-soft max-w-3xl" data-cockpit-field="android">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold">Android</h2>
        {!project.detected.hasAndroid && (
          <span className="text-[11px] rounded-full bg-warning/10 px-2 py-0.5 text-warning ring-1 ring-warning/20">
            Plateforme non détectée
          </span>
        )}
      </div>

      <DiscoveryHint title="À quoi servent ces valeurs ?">
        L'<strong>identifiant d'application</strong> identifie votre app sur
        Google Play. Le <strong>keystore</strong> est la clé cryptographique
        qui signe votre .aab avant publication.
      </DiscoveryHint>

      <div className="mt-4 space-y-4">
        <InlineText
          fieldKey="android.applicationId"
          source={sourceOf(project, "android.applicationId")}
          label="Identifiant d'application"
          value={cfg.applicationId ?? ""}
          placeholder="com.exemple.monapp"
          validate={validateApplicationId}
          onSave={(v) =>
            save(
              { applicationId: v.trim() || undefined },
              ["android.applicationId"],
            )
          }
        />
        <SigningProfileField
          project={project}
          value={cfg.signingProfileId}
          onChange={(id) =>
            save({ signingProfileId: id }, ["android.signingProfileId"])
          }
        />
        <div data-cockpit-field="android.keystorePath">
          <div className="flex items-center gap-2">
            <Label>Clé de signature — chemin manuel (avancé)</Label>
            <SourceBadge source={sourceOf(project, "android.keystorePath")} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Utilisé uniquement si aucun profil de signature n'est associé ci-dessus. Préférez la
            gestion via <b>Signatures Android</b> pour bénéficier du trousseau système.
          </p>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={cfg.keystorePath ?? ""}
              onChange={(e) =>
                save(
                  { keystorePath: e.target.value || undefined },
                  ["android.keystorePath"],
                )
              }
              placeholder="/chemin/vers/keystore.jks"
              className="font-mono"
            />
            <Button variant="secondary" onClick={chooseKeystore}>
              Parcourir
            </Button>
          </div>
        </div>

        <InlineText
          fieldKey="android.keystoreAlias"
          source={sourceOf(project, "android.keystoreAlias")}
          label="Alias de la clé"
          value={cfg.keystoreAlias ?? ""}
          placeholder="upload"
          onSave={(v) =>
            save(
              { keystoreAlias: v.trim() || undefined },
              ["android.keystoreAlias"],
            )
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <div data-cockpit-field="android.defaultTrack">
            <div className="flex items-center gap-2">
              <Label>Piste par défaut</Label>
              <SourceBadge source={sourceOf(project, "android.defaultTrack")} />
            </div>
            <Select
              value={cfg.defaultTrack ?? "internal"}
              onValueChange={(v) =>
                save(
                  { defaultTrack: v as NonNullable<typeof cfg.defaultTrack> },
                  ["android.defaultTrack"],
                )
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
            fieldKey="android.primaryLanguage"
            source={sourceOf(project, "android.primaryLanguage")}
            label="Langue principale"
            value={cfg.primaryLanguage ?? ""}
            placeholder="fr-FR"
            onSave={(v) =>
              save(
                { primaryLanguage: v.trim() || undefined },
                ["android.primaryLanguage"],
              )
            }
          />
        </div>

        <ExpertDetails title="Détails Android">
          <ExpertRow label="Application ID" value={cfg.applicationId} />
          <ExpertRow label="Keystore" value={cfg.keystorePath} />
          <ExpertRow label="Alias" value={cfg.keystoreAlias} />
          <ExpertRow label="Track" value={cfg.defaultTrack} />
          <ExpertRow label="Langue" value={cfg.primaryLanguage} />
          <ExpertRow
            label="Wrapper Gradle"
            value={project.detected.hasGradleWrapper ? "présent" : "absent"}
            copyable={false}
          />
        </ExpertDetails>
      </div>
    </Card>
  );
}

function IosSection({
  project,
  update,
}: {
  project: Project;
  update: UpdateFn;
}) {
  const cfg = project.publishing?.ios ?? {};
  function save(patch: Partial<typeof cfg>, touched: TrackedFieldKey[]) {
    const nextIos = { ...cfg, ...patch };
    update(
      { publishing: { ...(project.publishing ?? {}), ios: nextIos } },
      touched,
    );
  }
  return (
    <Card className="p-6 shadow-soft max-w-3xl" data-cockpit-field="ios">
      <div className="mb-4 flex items-center gap-2">
        <Apple className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-base font-semibold">iOS</h2>
        <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground ring-1 ring-border">
          Configuration disponible — publication à venir
        </span>
      </div>

      <DiscoveryHint title="Pré-configuration iOS">
        Renseigner ces informations dès maintenant permettra à AppPublisher
        de se connecter à App Store Connect et Fastlane sans nouvelle
        saisie lorsque la publication iOS sera activée.
      </DiscoveryHint>

      <div className="mt-4 space-y-4">
        <InlineText
          fieldKey="ios.bundleId"
          source={sourceOf(project, "ios.bundleId")}
          label="Bundle identifier"
          value={cfg.bundleId ?? ""}
          placeholder="com.exemple.monapp"
          validate={validateBundleId}
          onSave={(v) =>
            save({ bundleId: v.trim() || undefined }, ["ios.bundleId"])
          }
        />
        <InlineText
          fieldKey="ios.teamId"
          source={sourceOf(project, "ios.teamId")}
          label="Team ID"
          value={cfg.teamId ?? ""}
          placeholder="ABCDE12345"
          validate={validateAppleTeamId}
          onSave={(v) =>
            save({ teamId: v.trim() || undefined }, ["ios.teamId"])
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <InlineText
            fieldKey="ios.scheme"
            source={sourceOf(project, "ios.scheme")}
            label="Scheme Xcode"
            value={cfg.scheme ?? ""}
            placeholder="App"
            onSave={(v) =>
              save({ scheme: v.trim() || undefined }, ["ios.scheme"])
            }
          />
          <InlineText
            fieldKey="ios.releaseConfig"
            source={sourceOf(project, "ios.releaseConfig")}
            label="Configuration de release"
            value={cfg.releaseConfig ?? ""}
            placeholder="Release"
            onSave={(v) =>
              save(
                { releaseConfig: v.trim() || undefined },
                ["ios.releaseConfig"],
              )
            }
          />
        </div>
        <InlineText
          fieldKey="ios.primaryLanguage"
          source={sourceOf(project, "ios.primaryLanguage")}
          label="Langue principale"
          value={cfg.primaryLanguage ?? ""}
          placeholder="fr-FR"
          onSave={(v) =>
            save(
              { primaryLanguage: v.trim() || undefined },
              ["ios.primaryLanguage"],
            )
          }
        />

        <ExpertDetails title="Détails iOS">
          <ExpertRow label="Bundle ID" value={cfg.bundleId} />
          <ExpertRow label="Team ID" value={cfg.teamId} />
          <ExpertRow label="Scheme" value={cfg.scheme} />
          <ExpertRow label="Configuration" value={cfg.releaseConfig} />
          <ExpertRow label="Langue" value={cfg.primaryLanguage} />
        </ExpertDetails>
      </div>
    </Card>
  );
}

/* ---------------- Historique ---------------- */

function HistoryTab({ project }: { project: Project }) {
  const { refreshKey } = useCockpitNav();
  const records = useMemo(
    () => HistoryService.forProject(project.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id, refreshKey],
  );
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
  fieldKey,
  source,
  validate,
}: {
  label: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onSave: (v: string) => void;
  fieldKey?: string;
  source?: FieldSource;
  validate?: FieldValidator;
}) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLocal(value);
    setError(null);
  }, [value]);
  const dirty = local !== value;

  function attemptSave() {
    if (!dirty) return;
    try {
      onSave(local);
      // Le state parent va rafraîchir `value` — reset via l'effet ci-dessus.
    } catch (e) {
      // Restaure la valeur précédente et prévient l'utilisateur.
      setLocal(value);
      const message =
        e instanceof Error ? e.message : "L'enregistrement a échoué.";
      toast.error("Modification annulée", { description: message });
    }
  }

  return (
    <div data-cockpit-field={fieldKey}>
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <SourceBadge source={dirty ? "user" : source} />
      </div>
      <div className="mt-1.5 flex gap-2">
        <Input
          value={local}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => {
            setLocal(e.target.value);
            if (validate) setError(validate(e.target.value));
          }}
          onBlur={attemptSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === "Escape") {
              setLocal(value);
              setError(null);
            }
          }}
        />
        {dirty && (
          <Button size="sm" variant="secondary" onClick={attemptSave}>
            <Save className="h-4 w-4" />
            Enregistrer
          </Button>
        )}
      </div>
      {error && (
        <p className="mt-1 text-xs text-warning">{error}</p>
      )}
    </div>
  );
}

function InlineTextarea({
  label,
  value,
  placeholder,
  onSave,
  fieldKey,
  source,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  fieldKey?: string;
  source?: FieldSource;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const dirty = local !== value;

  function attemptSave() {
    if (!dirty) return;
    try {
      onSave(local);
    } catch (e) {
      setLocal(value);
      const message =
        e instanceof Error ? e.message : "L'enregistrement a échoué.";
      toast.error("Modification annulée", { description: message });
    }
  }

  return (
    <div data-cockpit-field={fieldKey}>
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <SourceBadge source={dirty ? "user" : source} />
      </div>
      <Textarea
        value={local}
        placeholder={placeholder}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={attemptSave}
        rows={3}
        className="mt-1.5"
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Signing profile selector                                          */
/* ---------------------------------------------------------------- */

function SigningProfileField({
  project: _project,
  value,
  onChange,
}: {
  project: unknown;
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}) {
  const profiles = SigningProfilesStore.list();
  const linked = value ? profiles.find((p) => p.id === value) : undefined;
  return (
    <div data-cockpit-field="android.signingProfileId" className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label>Signature associée à ce projet</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Recommandé — le mot de passe est protégé par le trousseau système.
          </p>
        </div>
        <Link to="/signing" className="text-xs text-primary underline underline-offset-2">
          Gérer les signatures
        </Link>
      </div>
      <div className="mt-2">
        <Select
          value={value ?? "__none__"}
          onValueChange={(v) => onChange(v === "__none__" ? undefined : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Aucune signature associée" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Aucune (configuration manuelle ci-dessous)</SelectItem>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · alias {p.alias}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {linked && (
        <div className="mt-2 text-xs text-muted-foreground">
          <span className="font-mono">{linked.keystorePath}</span>
          {linked.certificate?.validUntil && (
            <> · expire le {linked.certificate.validUntil.slice(0, 10)}</>
          )}
        </div>
      )}
      {profiles.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Aucune signature enregistrée pour l'instant.{" "}
          <Link to="/signing" className="text-primary underline underline-offset-2">
            En créer ou en importer une
          </Link>
          .
        </p>
      )}
    </div>
  );
}
