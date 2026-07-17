import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, FolderOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppStore } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
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
    setDetecting(true);
    try {
      const draft = await ProjectsService.detectFromPath(projectPath.trim());
      diag("wizard", "detect:draftReady", { name: draft.name });
      setDetected(draft);
      go(2, "detect:success");
    } catch (e) {
      diag("wizard", "detect:error", { error: String((e as Error)?.message ?? e) });
    } finally {
      setDetecting(false);
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

        <div className="mt-10">
          {step === 0 && (
            <Screen
              title="Bienvenue"
              subtitle="AppPublisher va vous accompagner pour publier vos applications Android sans jamais retenir une seule commande."
              icon={<Sparkles className="h-6 w-6" />}
            >
              <Button
                size="lg"
                onClick={() => {
                  diag("wizard", "click:commencer");
                  go(1, "click:commencer");
                }}
              >
                Commencer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Screen>
          )}

          {step === 1 && (
            <Screen
              title="Comment souhaitez-vous être appelé ?"
              subtitle="Nous utiliserons ce prénom pour vous accueillir sur le tableau de bord."
            >
              <div className="space-y-4">
                <Input
                  ref={nameInputRef}
                  type="text"
                  name="given-name"
                  autoComplete="given-name"
                  inputMode="text"
                  placeholder="Votre prénom"
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
                    Continuer
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Screen>
          )}

          {step === 2 && !detected && (
            <Screen
              title="Où se trouve votre projet ?"
              subtitle="Indiquez le dossier de votre application. Nous détecterons automatiquement ses caractéristiques."
              icon={<FolderOpen className="h-6 w-6" />}
            >
              <div className="space-y-4">
                <Input
                  ref={projectPathInputRef}
                  placeholder="Exemple : /Users/tim/Projets/CranioScan"
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  className="h-12 text-base font-mono"
                  onKeyDown={(e) => e.key === "Enter" && runDetection()}
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={skipProject}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    Ajouter un projet plus tard
                  </button>
                  <Button size="lg" onClick={runDetection} disabled={!projectPath.trim() || detecting}>
                    {detecting ? "Détection…" : "Détecter le projet"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Screen>
          )}

          {step === 2 && detected && (
            <Screen
              title="Projet Lovable détecté"
              subtitle="Nous avons reconnu votre projet. Vérifiez que tout est correct."
              icon={<Check className="h-6 w-6 text-success" />}
            >
              <div className="rounded-xl border bg-card p-5 shadow-soft">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                    {detected.logoEmoji}
                  </div>
                  <div>
                    <div className="text-lg font-semibold">{detected.name}</div>
                    <div className="text-sm text-muted-foreground truncate">{detected.localPath}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <Detected label="Application mobile" ok={detected.detected.hasCapacitorConfig} />
                  <Detected label="Version Android" ok={detected.detected.hasAndroid} />
                  <Detected label="Fichier de version" ok={detected.detected.hasVersionJson} />
                  <Detected label="Dépendances" ok={detected.detected.hasPackageJson} />
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
              title="Tout est prêt"
              subtitle="Vous pouvez maintenant publier vos applications en quelques clics. À tout moment, l'icône d'aide vous expliquera chaque écran."
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
  const steps = ["Bienvenue", "Prénom", "Projet", "Terminé"];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div className={"h-1.5 flex-1 rounded-full transition-colors " + (i <= step ? "bg-primary" : "bg-muted")} />
        </div>
      ))}
    </div>
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
      {subtitle && <p className="mt-3 text-base text-muted-foreground leading-relaxed">{subtitle}</p>}
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
