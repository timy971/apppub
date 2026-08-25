import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Bug, Check, Sparkles, Rocket, Eye, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { AppStore, useActiveProject, useSettings } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { VersionService } from "@/core/version/service";
import { HistoryService } from "@/core/history/service";
import { BackupService } from "@/core/backup/service";
import { bridge } from "@/core/bridge";
import type { TranslatedError, VersionChangeType, Workflow } from "@/core/types";
import { runWorkflow, wait } from "@/core/workflow/engine";
import { WorkflowView } from "@/components/workflow-view";
import { WhyButton } from "@/components/why-button";
import { ErrorCard } from "@/components/error-card";
import { translateError } from "@/core/errors/translator";
import { toast } from "sonner";
import { StepPurpose } from "@/components/step-purpose";
import { ProfilesStore } from "@/features/android-signing";
import { nextStepAfterVersion } from "@/core/navigation/publication-next-step";
import { requiredGooglePlayVersionCode } from "@/core/google-play/failure-store";

export const Route = createFileRoute("/version")({
  component: VersionAssistant,
});

const CHOICES: {
  type: VersionChangeType;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  why: string;
}[] = [
  {
    type: "bugfix",
    title: "Correction de bug",
    desc: "Petite amélioration ou correction.",
    icon: Bug,
    why: "Le troisième chiffre augmente (ex. 1.2.0 → 1.2.1). À utiliser pour corriger un souci sans nouvelle fonctionnalité.",
  },
  {
    type: "feature",
    title: "Nouvelle fonctionnalité",
    desc: "Ajout d'une nouveauté visible.",
    icon: Sparkles,
    why: "Le deuxième chiffre augmente (ex. 1.2.0 → 1.3.0). À utiliser dès qu'une nouveauté est visible pour vos utilisateurs.",
  },
  {
    type: "major",
    title: "Nouvelle version majeure",
    desc: "Grand changement, refonte.",
    icon: Rocket,
    why: "Le premier chiffre augmente (ex. 1.2.0 → 2.0.0). À réserver aux refontes importantes.",
  },
  {
    type: "readonly",
    title: "Voir uniquement la version",
    desc: "Ne rien modifier.",
    icon: Eye,
    why: "Consulter les propositions sans rien appliquer.",
  },
];

function VersionAssistant() {
  const project = useActiveProject();
  const settings = useSettings();
  const [choice, setChoice] = useState<VersionChangeType | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [done, setDone] = useState<{
    from: string;
    to: string;
    build: number;
    changed: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<TranslatedError | null>(null);

  if (!project) return <NoProject />;

  const requiredBuild = requiredGooglePlayVersionCode(project.id);
  const preview = choice ? VersionService.preview(project, choice, requiredBuild) : null;
  const nextStep = nextStepAfterVersion(
    project,
    ProfilesStore.list().map((profile) => profile.id),
  );

  async function apply() {
    if (!choice || !preview || !project) return;
    setConfirmOpen(false);
    setFailure(null);
    const start = performance.now();
    let backupId: string | undefined;
    let gitFilesBefore = new Set<string>();

    try {
      if (choice !== "readonly") {
        if (project.source?.type === "git") {
          const git = await bridge().git.status({
            projectPath: project.localPath,
            remoteUrl: project.source.remoteUrl,
            branch: project.source.branch,
          });
          // Les builds précédents d’AppPublisher peuvent légitimement avoir
          // modifié Gradle dans la copie locale. On mémorise ces fichiers pour
          // ne déclarer ensuite que les changements créés par cette opération.
          gitFilesBefore = new Set(git.changedFiles);
        }
        const backup = await BackupService.create(project, "version");
        backupId = backup.id;
      }

      const appliedRef: { current: { version: string; build: number } | null } = {
        current: null,
      };

      const wf = await runWorkflow({
        id: "version",
        title: "Mise à jour de la version",
        onUpdate: setWorkflow,
        steps: [
          {
            id: "read",
            title: "Lecture du numéro de version",
            run: async () => (await wait(300), { status: "success" }),
          },
          {
            id: "apply",
            title: "Application de la nouvelle version",
            run: async () => {
              try {
                appliedRef.current = await VersionService.apply(
                  project,
                  choice!,
                  undefined,
                  requiredBuild,
                );
                return { status: "success" };
              } catch (e) {
                return {
                  status: "error",
                  detail: (e instanceof Error ? e.message : String(e)).split("\n")[0],
                };
              }
            },
          },
          {
            id: "verify",
            title: "Vérification du projet",
            run: async () => (await wait(300), { status: "success" }),
          },
        ],
      });

      const hasError = wf.steps.some((s) => s.status === "error");
      if (hasError) {
        const errStep = wf.steps.find((s) => s.status === "error");
        setFailure(translateError(errStep?.detail));
        setWorkflow(wf);
        return;
      }

      const finalVersion = appliedRef.current?.version ?? preview.to;
      const finalBuild = appliedRef.current?.build ?? preview.newBuild;

      if (choice !== "readonly") {
        if (backupId) {
          let changedFiles = ["version.json", "package.json", "CHANGELOG.md"];
          if (project.source?.type === "git") {
            const git = await bridge().git.status({
              projectPath: project.localPath,
              remoteUrl: project.source.remoteUrl,
              branch: project.source.branch,
            });
            changedFiles = git.changedFiles.filter((file) => !gitFilesBefore.has(file));
          }
          BackupService.describeChanges(backupId, changedFiles);
        }
        ProjectsService.update(project.id, {
          currentVersion: finalVersion,
          currentBuild: finalBuild,
        });
        AppStore.refreshProjects();
        HistoryService.record({
          projectId: project.id,
          projectName: project.name,
          version: finalVersion,
          build: finalBuild,
          user: settings.userName || "vous",
          durationMs: performance.now() - start,
          outcome: "success",
          message: "Mise à jour de la version",
          kind: "version",
        });
        setDone({ from: preview.from, to: finalVersion, build: finalBuild, changed: true });
        toast.success("Version mise à jour", { description: `${preview.from} → ${finalVersion}` });
      } else {
        toast.info("Aucune modification appliquée");
        setDone({ from: preview.from, to: preview.to, build: preview.newBuild, changed: false });
      }
      setWorkflow(wf);
    } catch (e) {
      setFailure(translateError(e));
    }
  }

  if (done) {
    return (
      <div>
        <PageHeader
          title={done.changed ? "Version mise à jour" : "Version vérifiée"}
          subtitle={
            done.changed
              ? "Votre application est prête pour la prochaine étape."
              : "Aucun fichier n'a été modifié."
          }
        />
        <Card className="p-8 text-center shadow-soft">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-7 w-7" />
          </div>
          <div className="text-lg font-semibold">
            {done.changed ? (
              <>
                {done.from} → <span className="tabular-nums">{done.to}</span>
              </>
            ) : (
              <>
                Version <span className="tabular-nums">{done.to}</span>
              </>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">Numéro interne {done.build}</div>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to={nextStep.to}>
                {nextStep.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Retour au tableau de bord</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Préparer la version"
        subtitle="Choisissez le type de mise à jour. AppPublisher calcule automatiquement le nouveau numéro."
        help={{
          title: "À propos des versions",
          content: (
            <>
              Une version est composée de trois nombres : majeur.mineur.correctif. AppPublisher se
              charge de mettre à jour le bon.
            </>
          ),
        }}
      />

      <StepPurpose
        automatic="calculer les nouveaux numéros et sauvegarder l'application avant toute modification."
        yourAction="indiquer s'il s'agit d'une correction, d'une nouveauté ou d'une grande évolution."
        result="Google Play reconnaît cette version comme nouvelle."
      />

      {requiredBuild && project.currentBuild < requiredBuild && (
        <div role="alert" className="mb-6 rounded-xl border-2 border-danger bg-danger/10 p-4">
          <p className="font-semibold text-danger">Google Play exige un numéro plus élevé</p>
          <p className="mt-1 text-sm leading-relaxed">
            Le prochain numéro interne sera directement réglé sur <strong>{requiredBuild}</strong>,
            le minimum demandé par Google Play. Vous n’aurez pas à augmenter le numéro plusieurs
            fois.
          </p>
        </div>
      )}

      <div className="mb-6 rounded-xl border bg-muted/40 p-4 text-sm flex items-center justify-between">
        <span>
          Version actuelle · <strong className="tabular-nums">{project.currentVersion}</strong> ·
          Numéro interne <strong className="tabular-nums">{project.currentBuild}</strong>
        </span>
        {settings.autoBackupEnabled && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Sauvegarde automatique
          </span>
        )}
      </div>

      {!workflow && (
        <div className="grid gap-3 sm:grid-cols-2">
          {CHOICES.map((c) => {
            const p = VersionService.preview(project, c.type, requiredBuild);
            const Icon = c.icon;
            return (
              <div
                key={c.type}
                className="rounded-xl border bg-card p-5 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-elevated"
              >
                <button
                  type="button"
                  onClick={() => {
                    setChoice(c.type);
                    setConfirmOpen(true);
                  }}
                  className="block w-full text-left"
                >
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="block text-base font-semibold">{c.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{c.desc}</span>
                  <span className="mt-3 block text-sm tabular-nums">
                    {p.from} → <strong>{p.to}</strong>
                  </span>
                </button>
                <div className="mt-3">
                  <WhyButton title={c.title}>{c.why}</WhyButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {workflow && !failure && <WorkflowView workflow={workflow} />}
      {failure && (
        <div className="mt-4">
          <ErrorCard
            error={failure}
            onRetry={() => {
              setFailure(null);
              setWorkflow(null);
              setChoice(null);
            }}
          />
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {choice === "readonly" ? "Vérifier la version" : "Confirmer la mise à jour"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {choice === "readonly" ? (
                <>AppPublisher vérifiera les numéros actuels sans modifier vos fichiers.</>
              ) : (
                <>
                  La version passera de <strong className="tabular-nums">{preview?.from}</strong> à{" "}
                  <strong className="tabular-nums">{preview?.to}</strong>. Cette opération met à
                  jour votre application.
                  {settings.autoBackupEnabled && " Une sauvegarde sera automatiquement créée."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChoice(null)}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Confirmer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NoProject() {
  return (
    <div>
      <PageHeader title="Préparer la version" />
      <Card className="p-8 text-center shadow-soft">
        <div className="text-lg font-semibold">Aucune application active</div>
        <Button asChild className="mt-4">
          <Link to="/projects">Choisir une application</Link>
        </Button>
      </Card>
    </div>
  );
}
