import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderOpen,
  Link,
  SearchCheck,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppStore } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { bridge } from "@/core/bridge";
import type { GitRemoteInfo } from "@/core/bridge/types";
import type { ProjectDraft } from "@/core/types";
import { diag } from "@/core/diag/logger";

export const Route = createFileRoute("/setup")({
  component: SetupWizard,
});

type Step = 0 | 1 | 2 | 3;

function SetupWizard() {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<ProjectDraft | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [projectSource, setProjectSource] = useState<"local" | "online">("online");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteInfo, setRemoteInfo] = useState<GitRemoteInfo | null>(null);
  const [remoteBranch, setRemoteBranch] = useState("");
  const [inspectingRemote, setInspectingRemote] = useState(false);
  const [importingRemote, setImportingRemote] = useState(false);
  const [importedProjectName, setImportedProjectName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const projectPathInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    diag("wizard", "mount");
    return () => diag("wizard", "unmount");
  }, []);

  useEffect(() => {
    diag("wizard", "step:changed", { step });
  }, [step]);

  // Focus différé après le commit (via requestAnimationFrame), au lieu de
  // autoFocus natif : autoFocus déclenche en interne un `.focus()` synchrone
  // pendant commitHostMount, qui provoque un événement selectionchange
  // traité par React en pleine phase de commit — cause du freeze renderer.
  useEffect(() => {
    // DIAGNOSTIC TEMPORAIRE — focus désactivé pour isoler la cause du freeze
    if (step === 1) {
      // const raf = requestAnimationFrame(() => nameInputRef.current?.focus());
      // return () => cancelAnimationFrame(raf);
    }
    if (step === 2 && !detected) {
      // const raf = requestAnimationFrame(() => projectPathInputRef.current?.focus());
      // return () => cancelAnimationFrame(raf);
    }
  }, [step, detected]);

  function go(next: Step, reason: string) {
    diag("wizard", "setStep", { from: step, to: next, reason });
    setStep(next);
  }

  async function runDetection() {
    diag("wizard", "click:detect", { projectPath });
    if (!projectPath.trim()) {
      diag("wizard", "detect:skip:emptyPath");
      return;
    }
    setDetectionError(null);
    setDetecting(true);
    try {
      const draft = await ProjectsService.detectFromPath(projectPath.trim());
      diag("wizard", "detect:draftReady", { name: draft.name });
      setDetected(draft);
      go(2, "detect:success");
    } catch (e) {
      const message = String((e as Error)?.message ?? e);
      diag("wizard", "detect:error", { error: message });
      setDetected(null);
      setDetectionError(message);
    } finally {
      setDetecting(false);
    }
  }

  async function chooseProjectFolder() {
    setDetectionError(null);
    try {
      const selected = await bridge().projects.chooseFolder();
      if (!selected) return;
      setProjectPath(selected);
      setDetected(null);
    } catch (error) {
      setDetectionError(
        error instanceof Error ? error.message : "Impossible d'ouvrir le sélecteur de dossier.",
      );
    }
  }

  async function inspectRemote() {
    if (!remoteUrl.trim()) return;
    setDetectionError(null);
    setRemoteInfo(null);
    setInspectingRemote(true);
    try {
      const info = await ProjectsService.inspectRemote(remoteUrl.trim());
      setRemoteInfo(info);
      setRemoteBranch(info.defaultBranch);
    } catch (error) {
      setDetectionError(
        error instanceof Error
          ? error.message
          : "Ce lien n'est pas accessible. Vérifiez-le puis réessayez.",
      );
    } finally {
      setInspectingRemote(false);
    }
  }

  async function importRemote() {
    if (!remoteInfo || !remoteBranch) return;
    setDetectionError(null);
    setImportingRemote(true);
    try {
      const project = await ProjectsService.importFromGit(remoteInfo.remoteUrl, remoteBranch);
      AppStore.refreshProjects();
      AppStore.setActiveProject(project.id);
      setImportedProjectName(project.name);
      go(3, "import:success");
    } catch (error) {
      setDetectionError(
        error instanceof Error
          ? error.message
          : "Impossible d'ajouter cette application pour le moment.",
      );
    } finally {
      setImportingRemote(false);
    }
  }

  function finish() {
    diag("wizard", "click:finish", { hasDetected: !!detected, name });
    if (detected) {
      const project = ProjectsService.save(detected);
      AppStore.refreshProjects();
      AppStore.setActiveProject(project.id);
    }
    AppStore.updateSettings({
      userName: name.trim() || "vous",
      onboardingCompleted: true,
    });
    diag("wizard", "navigate:home");
    navigate({ to: "/" });
  }

  function skipProject() {
    diag("wizard", "click:skipProject");
    AppStore.updateSettings({
      userName: name.trim() || "vous",
      onboardingCompleted: true,
    });
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground text-base font-bold">
            A
          </div>
          <div>
            <div className="text-lg font-semibold">AppPublisher</div>
            <div className="text-xs text-muted-foreground">Configuration initiale</div>
          </div>
        </div>

        <Progress step={step} />

        {(step === 1 || step === 2) && (
          <button
            type="button"
            onClick={() => go((step - 1) as Step, "click:back")}
            className="mt-5 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour
          </button>
        )}

        <div className={step === 0 || step === 3 ? "mt-10" : "mt-5"}>
          {step === 0 && (
            <Screen
              title="Publier une application devient un parcours guidé"
              subtitle="AppPublisher vérifie, prépare et publie votre application Android. Vous gardez toujours le dernier mot."
              icon={<Sparkles className="h-6 w-6" />}
            >
              <div
                className="mb-8 grid gap-3 sm:grid-cols-3"
                aria-label="Ce qu'AppPublisher va faire"
              >
                <PromiseCard
                  icon={FolderOpen}
                  title="1. Choisir"
                  text="Vous indiquez simplement votre application."
                />
                <PromiseCard
                  icon={SearchCheck}
                  title="2. Vérifier"
                  text="Les problèmes sont détectés et expliqués."
                />
                <PromiseCard
                  icon={Send}
                  title="3. Publier"
                  text="Rien n'est envoyé sans votre confirmation."
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  onClick={() => {
                    diag("wizard", "click:commencer");
                    go(1, "click:commencer");
                  }}
                >
                  Configurer AppPublisher
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">Environ une minute</span>
              </div>
            </Screen>
          )}

          {step === 1 && (
            <Screen
              title="Comment pouvons-nous vous appeler ?"
              subtitle="Cette étape est facultative. Le prénom sert uniquement à personnaliser l'accueil."
            >
              <div className="space-y-4">
                <Input
                  ref={nameInputRef}
                  type="text"
                  name="given-name"
                  autoComplete="off"
                  inputMode="text"
                  placeholder="Votre prénom (facultatif)"
                  value={name}
                  onChange={(e) => {
                    diag("wizard", "input:name:change", { length: e.target.value.length });
                    setName(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) {
                      diag("wizard", "keydown:Enter:name");
                      go(2, "enter:name");
                    }
                  }}
                  className="h-12 bg-card text-base caret-primary"
                />
                <div className="flex justify-end">
                  <Button
                    size="lg"
                    onMouseDown={() => diag("wizard", "btn:continuer:name:mousedown", { name })}
                    onClick={() => {
                      diag("wizard", "click:continuer:name", { name });
                      go(2, "click:continuer:name");
                    }}
                  >
                    {name.trim() ? "Continuer" : "Continuer sans prénom"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Screen>
          )}

          {step === 2 && !detected && (
            <Screen
              title="Où se trouve votre application ?"
              subtitle="Choisissez la réponse la plus simple pour vous. AppPublisher s'occupe du reste."
              icon={<FolderOpen className="h-6 w-6" />}
            >
              <div className="space-y-4">
                <div
                  className="grid gap-3 sm:grid-cols-2"
                  aria-label="Emplacement de l'application"
                >
                  <SourceChoice
                    selected={projectSource === "online"}
                    icon={Link}
                    title="Sur GitHub ou Lovable"
                    text="Mon projet Lovable est connecté à GitHub."
                    onClick={() => {
                      setProjectSource("online");
                      setDetectionError(null);
                    }}
                  />
                  <SourceChoice
                    selected={projectSource === "local"}
                    icon={FolderOpen}
                    title="Dans un dossier sur ce Mac"
                    text="Mon application est déjà téléchargée."
                    onClick={() => {
                      setProjectSource("local");
                      setDetectionError(null);
                    }}
                  />
                </div>

                {projectSource === "online" ? (
                  <div className="space-y-4 rounded-xl border bg-card p-4">
                    <div>
                      <label htmlFor="setup-remote-url" className="text-sm font-medium">
                        Lien de votre application
                      </label>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Collez le lien du dépôt GitHub connecté à votre projet Lovable. Le lien de
                        partage Lovable ne fonctionne pas ici.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="setup-remote-url"
                        type="url"
                        placeholder="https://github.com/votre-compte/votre-application"
                        value={remoteUrl}
                        onChange={(event) => {
                          setRemoteUrl(event.target.value);
                          setRemoteInfo(null);
                          setDetectionError(null);
                        }}
                        className="h-12 text-base"
                        onKeyDown={(event) => event.key === "Enter" && inspectRemote()}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={inspectRemote}
                        disabled={!remoteUrl.trim() || inspectingRemote}
                      >
                        {inspectingRemote ? "Vérification…" : "Vérifier le lien"}
                      </Button>
                    </div>

                    {remoteInfo && (
                      <div className="space-y-3 rounded-lg bg-success/10 p-4">
                        <p className="flex items-center gap-2 text-sm font-medium text-success">
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Application trouvée
                        </p>
                        <label htmlFor="setup-remote-version" className="text-sm font-medium">
                          Version du projet à utiliser
                        </label>
                        <select
                          id="setup-remote-version"
                          value={remoteBranch}
                          onChange={(event) => setRemoteBranch(event.target.value)}
                          className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          {remoteInfo.branches.map((branch) => (
                            <option key={branch} value={branch}>
                              {branch === remoteInfo.defaultBranch
                                ? `${branch} (recommandée)`
                                : branch}
                            </option>
                          ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          Gardez le choix recommandé si vous ne savez pas lequel prendre.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4 rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground">
                      AppPublisher reconnaît automatiquement le dossier. Aucun fichier technique
                      n'est à sélectionner.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        ref={projectPathInputRef}
                        placeholder="Exemple : /Users/tim/Projets/CranioScan"
                        value={projectPath}
                        onChange={(e) => {
                          setProjectPath(e.target.value);
                          setDetected(null);
                          setDetectionError(null);
                        }}
                        className="h-12 text-base"
                        onKeyDown={(e) => e.key === "Enter" && runDetection()}
                      />
                      <Button type="button" variant="secondary" onClick={chooseProjectFolder}>
                        Parcourir
                      </Button>
                    </div>
                    <details className="group rounded-lg bg-muted/40 p-4 text-sm">
                      <summary className="cursor-pointer select-none font-medium text-foreground">
                        Je ne sais pas où se trouve le dossier
                      </summary>
                      <div className="mt-3 space-y-2 text-muted-foreground leading-relaxed">
                        <p>
                          Cliquez sur <strong>Parcourir</strong>, puis choisissez le dossier portant
                          le nom de votre application.
                        </p>
                        <p>
                          Sur macOS, regardez d'abord dans <em>Téléchargements</em>,
                          <em> Documents</em> ou votre dossier de projets.
                        </p>
                      </div>
                    </details>
                  </div>
                )}
                {detectionError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
                  >
                    {detectionError}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={skipProject}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Ajouter un projet plus tard
                  </button>
                  <Button
                    size="lg"
                    onClick={projectSource === "online" ? importRemote : runDetection}
                    disabled={
                      projectSource === "online"
                        ? !remoteInfo || !remoteBranch || importingRemote
                        : !projectPath.trim() || detecting
                    }
                  >
                    {projectSource === "online"
                      ? importingRemote
                        ? "Ajout en cours…"
                        : "Ajouter cette application"
                      : detecting
                        ? "Détection…"
                        : "Reconnaître l'application"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Screen>
          )}

          {step === 2 && detected && (
            <Screen
              title="Application détectée"
              subtitle="AppPublisher a reconnu le dossier. Vérifiez simplement son nom."
              icon={<Check className="h-6 w-6 text-success" />}
            >
              <div className="rounded-xl border bg-card p-5 shadow-soft">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                    {detected.logoEmoji}
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{detected.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {detected.localPath}
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <Detected label="Application mobile" ok={detected.detected.hasCapacitorConfig} />
                  <Detected label="Version Android" ok={detected.detected.hasAndroid} />
                  <Detected label="Fichier de version" ok={detected.detected.hasVersionJson} />
                  <Detected label="Fichiers nécessaires" ok={detected.detected.hasPackageJson} />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    diag("wizard", "click:autreDossier");
                    setDetected(null);
                  }}
                >
                  Choisir un autre dossier
                </Button>
                <Button
                  size="lg"
                  onClick={() => {
                    diag("wizard", "click:continuer:detected");
                    go(3, "click:continuer:detected");
                  }}
                >
                  Continuer
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Screen>
          )}

          {step === 3 && (
            <Screen
              title="AppPublisher est prêt à vous guider"
              subtitle={`${importedProjectName ? `${importedProjectName} a bien été ajoutée. ` : ""}L'accueil affichera toujours la prochaine action utile. Chaque écran indique son objectif et explique comment débloquer un problème.`}
              icon={<Check className="h-6 w-6 text-success" />}
            >
              <Button size="lg" onClick={finish}>
                Ouvrir le tableau de bord
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Screen>
          )}
        </div>
      </div>
    </div>
  );
}

function Progress({ step }: { step: number }) {
  const steps = ["Bienvenue", "Prénom", "Application", "Terminé"];
  return (
    <div
      className="flex items-center gap-2"
      role="progressbar"
      aria-label="Configuration initiale"
      aria-valuemin={1}
      aria-valuemax={steps.length}
      aria-valuenow={step + 1}
      aria-valuetext={`${steps[step]}, étape ${step + 1} sur ${steps.length}`}
    >
      {steps.map((label, i) => (
        <div key={label} className="min-w-0 flex-1">
          <div
            className={
              "h-1.5 flex-1 rounded-full transition-colors " +
              (i <= step ? "bg-primary" : "bg-muted")
            }
          />
          <div
            className={
              "mt-2 truncate text-center text-[11px] " +
              (i === step ? "font-medium text-foreground" : "text-muted-foreground")
            }
          >
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function PromiseCard({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-soft">
      <Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
      <div className="text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function SourceChoice({
  selected,
  icon: Icon,
  title,
  text,
  onClick,
}: {
  selected: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/50"
      }`}
    >
      <Icon className="mb-3 h-5 w-5 text-primary" aria-hidden="true" />
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{text}</span>
    </button>
  );
}

function Screen({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      {icon && (
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </div>
      )}
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-3 text-base text-muted-foreground leading-relaxed">{subtitle}</p>
      )}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Detected({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <span
        className={
          "inline-flex h-5 w-5 items-center justify-center rounded-full " +
          (ok ? "bg-success/15 text-success" : "bg-muted-foreground/15 text-muted-foreground")
        }
      >
        {ok ? <Check className="h-3 w-3" /> : "–"}
      </span>
      <span>{label}</span>
    </div>
  );
}
