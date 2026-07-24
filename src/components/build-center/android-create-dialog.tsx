import { useEffect, useMemo, useState } from "react";
import { Loader2, X, CheckCircle2, AlertTriangle } from "lucide-react";
import type { Project } from "@/core/types";
import { OperationRunner } from "@/core/operations/runner";
import { useOperationSnapshot } from "@/core/operations/use-operation";
import { createAndroidCreateOperation } from "@/core/operations/android-create";
import { AppStore, useSettings } from "@/core/store/app-store";
import { translateError } from "@/core/errors/translator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StepsTimeline } from "./steps-timeline";
import { LogConsole } from "./log-console";

interface Props {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Appelé lorsqu'un succès (ou already-exists) est confirmé. */
  onSuccess: () => void;
}

/**
 * Dialog de progression pour la création du projet Android.
 * Réutilise l'infrastructure OperationRunner + StepsTimeline + LogConsole
 * du Build Center. Aucun nouveau moteur d'exécution.
 */
export function AndroidCreateDialog({ project, open, onOpenChange, onSuccess }: Props) {
  const settings = useSettings();
  const [runner, setRunner] = useState<OperationRunner | null>(null);
  const snap = useOperationSnapshot(runner);
  const [now, setNow] = useState(() => performance.now());

  // Démarre l'opération à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const r = new OperationRunner(createAndroidCreateOperation(project));
    setRunner(r);
    void r.run();
    return () => {
      r.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, project.id]);

  useEffect(() => {
    if (snap.status !== "running") return;
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [snap.status]);

  // Rafraîchit AppStore + notifie le parent à la fin.
  useEffect(() => {
    if (snap.status === "success") {
      AppStore.refreshProjects();
      onSuccess();
    }
  }, [snap.status, onSuccess]);

  const translated = useMemo(
    () => (snap.status === "error" ? translateError(snap.error) : null),
    [snap.status, snap.error],
  );

  const running = snap.status === "running";
  const canClose = !running;

  const outcomeMessage = useMemo(() => {
    if (snap.status !== "success") return null;
    const result = snap.result as { outcome?: { kind: string } } | undefined;
    if (result?.outcome?.kind === "already-exists") {
      return "Le projet Android existait déjà. Le préflight a été relancé.";
    }
    return "Projet Android créé avec succès.";
  }, [snap.status, snap.result]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !canClose) return;
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : snap.status === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : snap.status === "error" ? (
              <AlertTriangle className="h-5 w-5 text-danger" />
            ) : null}
            Création du projet Android
          </DialogTitle>
          <DialogDescription>
            AppPublisher exécute <code>npx cap add android</code> dans le dossier du projet.
            Vous n'avez pas besoin d'ouvrir de terminal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <StepsTimeline steps={snap.steps} nowMs={now} />

          {outcomeMessage && (
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
              {outcomeMessage}
            </div>
          )}

          {translated && (
            <div className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm">
              <div className="font-medium">{translated.title}</div>
              <div className="mt-1 text-muted-foreground">{translated.explanation}</div>
            </div>
          )}

          {snap.status === "cancelled" && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
              La création du projet Android a été interrompue.
            </div>
          )}

          <LogConsole logs={snap.logs} mode={settings.mode} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {running ? (
            <Button variant="outline" onClick={() => runner?.cancel()}>
              <X className="h-4 w-4" />
              Annuler
            </Button>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
