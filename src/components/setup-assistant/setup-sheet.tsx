import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Info,
  Sparkles,
  ExternalLink,
  SkipForward,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useActiveProject } from "@/core/store/app-store";
import { ProjectsService } from "@/core/projects/service";
import { AppStore } from "@/core/store/app-store";
import { SETUP_STEPS } from "./step-registry";
import type { SetupStep } from "./step";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  initialStepId?: string;
}

/**
 * Setup Assistant — fil conducteur de la configuration.
 *
 * L'assistant NE stocke aucun état métier : il lit ProjectStatusService
 * pour connaître l'ordre des étapes restantes, et écrit exclusivement
 * via ProjectsService.update(). Le Cockpit reste la source de vérité.
 */
export function SetupSheet({ open, onOpenChange, initialStepId }: Props) {
  const project = useActiveProject();
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Étapes applicables au projet actif.
  const steps = useMemo<SetupStep[]>(() => {
    if (!project) return [];
    return SETUP_STEPS.filter((s) => s.isRelevant(project));
  }, [project]);

  // Réinitialise l'index quand l'assistant s'ouvre.
  useEffect(() => {
    if (!open || !project) return;
    setSkipped(new Set());
    // Cible explicite ?
    if (initialStepId) {
      const idx = steps.findIndex((s) => s.id === initialStepId);
      if (idx >= 0) {
        setCurrent(idx);
        return;
      }
    }
    // Sinon, première étape non satisfaite.
    const idx = steps.findIndex((s) => !s.isDone(project));
    setCurrent(idx >= 0 ? idx : steps.length);
  }, [open, project, initialStepId, steps]);

  // Préremplit le champ à chaque changement d'étape.
  useEffect(() => {
    if (!project || !steps[current]) return;
    setDraft(steps[current].read(project));
    setError(null);
  }, [current, project, steps]);

  if (!project) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Aucun projet sélectionné</SheetTitle>
          </SheetHeader>
          <p className="mt-4 text-sm text-muted-foreground">
            L'Assistant a besoin d'un projet actif pour se lancer.
          </p>
          <div className="mt-6 flex justify-end">
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate({ to: "/projects" });
              }}
            >
              Ouvrir mes projets
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // Étapes déjà validées (pour la barre de progression).
  const completedCount = steps.filter(
    (s) => s.isDone(project) || skipped.has(s.id),
  ).length;
  const totalCount = steps.length;
  const percent = totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100);

  const isFinished = current >= steps.length;
  const step = isFinished ? null : steps[current];

  function goNext() {
    // Cherche la prochaine étape non satisfaite après l'index courant.
    for (let i = current + 1; i < steps.length; i++) {
      if (!steps[i].isDone(project!) && !skipped.has(steps[i].id)) {
        setCurrent(i);
        return;
      }
    }
    setCurrent(steps.length);
  }

  function handleSkip() {
    if (!step) return;
    setSkipped((s) => new Set(s).add(step.id));
    goNext();
  }

  function handleSave() {
    if (!step || !project) return;
    const value = draft.trim();
    // Étape optionnelle : autorise une valeur vide.
    if (!value && !step.optional) {
      setError("Ce champ est requis.");
      return;
    }
    if (value && step.validate) {
      const err = step.validate(value);
      if (err) {
        setError(err);
        return;
      }
    }
    const { patch, touched } = step.write(project, value);
    ProjectsService.update(project.id, patch, { touched });
    AppStore.refreshProjects();
    toast.success("Enregistré", { description: step.title });
    goNext();
  }

  function openInCockpit() {
    if (!step) return;
    onOpenChange(false);
    navigate({
      to: "/projects/$id",
      params: { id: project!.id },
      search: step.cockpitField
        ? { tab: step.cockpitTab ?? "identity", field: step.cockpitField }
        : { tab: step.cockpitTab ?? "identity" },
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl overflow-y-auto p-0"
      >
        {/* Header */}
        <div className="border-b bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <SheetTitle className="text-lg">Assistant AppPublisher</SheetTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {project.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Fermer l'assistant"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-4">
            <Progress value={percent} className="h-1.5" />
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>
                Étape {Math.min(current + 1, totalCount || 1)} / {totalCount || 1}
              </span>
              <span>{percent}% configuré</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {isFinished ? (
            <ReadyScreen onClose={() => onOpenChange(false)} />
          ) : step ? (
            <StepBody
              step={step}
              value={draft}
              onChange={(v) => {
                setDraft(v);
                if (error) setError(null);
              }}
              error={error}
            />
          ) : null}
        </div>

        {/* Footer */}
        {step && !isFinished && (
          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-6 py-4">
            <button
              type="button"
              onClick={openInCockpit}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ouvrir dans le cockpit
            </button>
            <div className="flex items-center gap-2">
              {step.optional && (
                <Button variant="ghost" size="sm" onClick={handleSkip}>
                  <SkipForward className="h-3.5 w-3.5" />
                  Passer
                </Button>
              )}
              <Button size="lg" onClick={handleSave}>
                Enregistrer et continuer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StepBody({
  step,
  value,
  onChange,
  error,
}: {
  step: SetupStep;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
        {step.optional && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Optionnel
          </span>
        )}
      </div>

      {/* Bloc « Pourquoi ? » — toujours visible */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="text-sm text-foreground/90">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Pourquoi ?
          </div>
          <p className="mt-1 leading-relaxed">{step.why}</p>
        </div>
      </div>

      {/* Champ */}
      <div className="space-y-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={step.example}
          className="h-12 text-base"
          autoFocus
        />
        {step.hint && (
          <p className="text-xs text-muted-foreground">{step.hint}</p>
        )}
        {error && (
          <p className="text-xs text-danger">{error}</p>
        )}
      </div>
    </div>
  );
}

function ReadyScreen({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-6 py-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          Projet prêt à construire
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          Toutes les informations nécessaires sont réunies. Vous pouvez
          désormais lancer un build ou préparer une release.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button size="lg" onClick={onClose}>
          Terminer
        </Button>
      </div>
    </div>
  );
}
