import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  Loader2,
  PackageCheck,
  ShieldCheck,
  X,
} from "lucide-react";
import type { Project } from "@/core/types";
import type { AndroidPreparationAnalysis, AndroidPreparationRequest } from "@/core/bridge/types";
import { bridge } from "@/core/bridge";
import { CapacitorService } from "@/core/capacitor/service";
import { OperationRunner } from "@/core/operations/runner";
import { useOperationSnapshot } from "@/core/operations/use-operation";
import { createAndroidCreateOperation } from "@/core/operations/android-create";
import { BackupService } from "@/core/backup/service";
import { ProjectsService } from "@/core/projects/service";
import { AppStore, useSettings } from "@/core/store/app-store";
import { validateApplicationId } from "@/core/projects/validators";
import { translateError } from "@/core/errors/translator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StepsTimeline } from "./steps-timeline";
import { LogConsole } from "./log-console";

interface Props {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const SAFE_WEB_DIR =
  /^(?!\.?\.?\/)(?!\/?(?:android|ios|node_modules)(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

export function AndroidCreateDialog({ project, open, onOpenChange, onSuccess }: Props) {
  const settings = useSettings();
  const [analysis, setAnalysis] = useState<AndroidPreparationAnalysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [gitBlocker, setGitBlocker] = useState<string | null>(null);
  const [appName, setAppName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [webDir, setWebDir] = useState("");
  const [identifierConfirmed, setIdentifierConfirmed] = useState(false);
  const [runner, setRunner] = useState<OperationRunner | null>(null);
  const snap = useOperationSnapshot(runner);
  const [now, setNow] = useState(() => performance.now());
  const completedRef = useRef<string | null>(null);
  const recoveryRef = useRef<string | null>(null);
  const transactionRef = useRef<{ backupId: string; guardToken: string } | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  const inspect = useCallback(async () => {
    setAnalyzing(true);
    setAnalysisError(null);
    setGitBlocker(null);
    setRunner(null);
    setRecoveryMessage(null);
    transactionRef.current = null;
    setIdentifierConfirmed(false);
    try {
      const result = await CapacitorService.inspect(project.localPath);
      if (project.source?.type === "git") {
        const git = await bridge().git.status({
          projectPath: project.localPath,
          remoteUrl: project.source.remoteUrl,
          branch: project.source.branch,
        });
        if (git.workingTree === "dirty") {
          setGitBlocker(
            "Ce projet contient déjà des modifications locales. Enregistrez-les dans Git avant de préparer Android afin de pouvoir distinguer clairement les changements d’AppPublisher.",
          );
        }
      }
      setAnalysis(result);
      setAppName(result.appName);
      setApplicationId(result.applicationId);
      setWebDir(result.webDir);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : String(error));
    } finally {
      setAnalyzing(false);
    }
  }, [project.localPath, project.source?.branch, project.source?.remoteUrl, project.source?.type]);

  useEffect(() => {
    if (open) void inspect();
  }, [open, inspect]);

  useEffect(() => {
    if (snap.status !== "running") return;
    const id = window.setInterval(() => setNow(performance.now()), 1000);
    return () => window.clearInterval(id);
  }, [snap.status]);

  useEffect(() => {
    if (snap.status !== "success" || completedRef.current === snap.id) return;
    completedRef.current = snap.id;
    const result = snap.result as { applicationId?: string } | undefined;
    void (async () => {
      const transaction = transactionRef.current;
      if (transaction) {
        try {
          await bridge().androidPreparation.completeRollbackGuard(
            project.localPath,
            transaction.guardToken,
          );
        } catch {
          setRecoveryMessage(
            "Android a été créé, mais la finalisation de la garde de restauration n’a pas pu être vérifiée.",
          );
        } finally {
          transactionRef.current = null;
        }
      }
      await ProjectsService.refreshDetection(project.id, result?.applicationId);
      AppStore.refreshProjects();
      onSuccess();
    })();
  }, [onSuccess, project.id, project.localPath, snap.id, snap.result, snap.status]);

  useEffect(() => {
    if (snap.status !== "error" && snap.status !== "cancelled") return;
    if (recoveryRef.current === snap.id) return;
    const transaction = transactionRef.current;
    if (!transaction) return;
    recoveryRef.current = snap.id;
    setRecoveryMessage("Restauration automatique du projet en cours…");
    void (async () => {
      let restored = false;
      let cleaned = false;
      try {
        restored = await BackupService.restore(project, transaction.backupId);
      } catch {
        restored = false;
      }
      try {
        await bridge().androidPreparation.rollbackCreatedArtifacts(
          project.localPath,
          transaction.guardToken,
        );
        cleaned = true;
      } catch {
        cleaned = false;
      } finally {
        transactionRef.current = null;
      }
      setRecoveryMessage(
        restored && cleaned
          ? "Le projet a été restauré dans son état initial."
          : "La restauration automatique n’a pas pu être entièrement vérifiée. La sauvegarde reste disponible dans la fiche du projet.",
      );
    })();
  }, [project, snap.id, snap.status]);

  const translated = useMemo(
    () => (snap.status === "error" ? translateError(snap.error) : null),
    [snap.status, snap.error],
  );
  const appIdError = validateApplicationId(applicationId);
  const webDirError = SAFE_WEB_DIR.test(webDir.trim())
    ? null
    : "Dossier relatif attendu, par exemple dist";
  const running = snap.status === "running";
  const configuringExisting = !!analysis?.hasCapacitorConfig;
  const canStart =
    analysis?.status === "preparable" &&
    !gitBlocker &&
    !!appName.trim() &&
    !appIdError &&
    !webDirError &&
    identifierConfirmed &&
    !runner;

  async function start() {
    if (!analysis || !canStart) return;
    const request: AndroidPreparationRequest = {
      appName: appName.trim(),
      applicationId: applicationId.trim(),
      webDir: webDir.trim(),
      packageManager: analysis.packageManager,
    };
    try {
      const backup = await BackupService.create(project, "manual");
      const guard = await bridge().androidPreparation.beginRollbackGuard(
        project.localPath,
        request,
      );
      transactionRef.current = { backupId: backup.id, guardToken: guard.token };
      const next = new OperationRunner(createAndroidCreateOperation(project, request));
      setRunner(next);
      void next.run();
    } catch (error) {
      setAnalysisError(
        `La sauvegarde préalable a échoué. Aucun fichier n’a été modifié. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const outcomeMessage = useMemo(() => {
    if (snap.status !== "success") return null;
    const result = snap.result as
      { outcome?: { kind: string; debugArtifact?: string } } | undefined;
    if (result?.outcome?.kind === "already-ready") return "Le projet Android était déjà prêt.";
    return result?.outcome?.debugArtifact
      ? `Android est prêt. Compilation de contrôle : ${result.outcome.debugArtifact}`
      : "Android est prêt et la compilation de contrôle a réussi.";
  }, [snap.result, snap.status]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && running) return;
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {running || analyzing ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : snap.status === "success" || analysis?.status === "ready" ? (
              <CheckCircle2 className="h-5 w-5 text-success" />
            ) : analysis?.status === "blocked" || analysisError ? (
              <AlertTriangle className="h-5 w-5 text-danger" />
            ) : (
              <PackageCheck className="h-5 w-5 text-primary" />
            )}
            Préparer ce projet pour Android
          </DialogTitle>
          <DialogDescription>
            AppPublisher analyse d’abord le dépôt, puis vous montre exactement ce qui sera modifié.
          </DialogDescription>
        </DialogHeader>

        {analyzing && (
          <div className="rounded-lg border bg-muted/30 p-5 text-sm text-muted-foreground">
            Analyse du projet, de son build web et de Capacitor…
          </div>
        )}

        {analysisError && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
            <div className="font-medium text-danger">Analyse impossible</div>
            <div className="mt-1 text-muted-foreground">{analysisError}</div>
          </div>
        )}

        {!runner && analysis?.status === "ready" && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-4 text-sm">
            <div className="font-medium">Ce projet est déjà prêt pour Android.</div>
            <div className="mt-1 text-muted-foreground">
              Le dossier android/, Gradle et la configuration native sont présents.
            </div>
          </div>
        )}

        {!runner && analysis?.status === "blocked" && (
          <div className="rounded-lg border border-danger/40 bg-danger/5 p-4 text-sm">
            <div className="font-medium">Préparation automatique bloquée</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {analysis.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}

        {!runner && analysis?.status === "preparable" && (
          <div className="space-y-5">
            {gitBlocker && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
                <div className="font-medium">Modifications Git déjà présentes</div>
                <div className="mt-1 text-muted-foreground">{gitBlocker}</div>
              </div>
            )}

            {analysis.warnings.map((warning) => (
              <div
                key={warning}
                className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm text-muted-foreground"
              >
                {warning}
              </div>
            ))}

            <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Configuration proposée</div>
                  <div className="text-xs text-muted-foreground">
                    Gestionnaire détecté : {analysis.packageManager} · build :{" "}
                    {analysis.buildScript}
                  </div>
                </div>
                {configuringExisting && (
                  <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                    Configuration existante conservée
                  </span>
                )}
              </div>
              <div>
                <Label htmlFor="android-app-name">Nom de l’application</Label>
                <Input
                  id="android-app-name"
                  className="mt-1.5"
                  value={appName}
                  onChange={(event) => setAppName(event.target.value)}
                  disabled={configuringExisting}
                />
              </div>
              <div>
                <Label htmlFor="android-web-dir">Dossier du build web</Label>
                <Input
                  id="android-web-dir"
                  className="mt-1.5 font-mono"
                  value={webDir}
                  onChange={(event) => setWebDir(event.target.value)}
                  disabled={configuringExisting}
                />
                {webDirError && <div className="mt-1 text-xs text-danger">{webDirError}</div>}
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="android-app-id">Identifiant Android définitif</Label>
                <Input
                  id="android-app-id"
                  className="mt-1.5 font-mono"
                  value={applicationId}
                  onChange={(event) => {
                    setApplicationId(event.target.value);
                    setIdentifierConfirmed(false);
                  }}
                  disabled={configuringExisting}
                />
                <div className="mt-1 text-xs text-muted-foreground">
                  Google Play lie définitivement la fiche de l’application à cet identifiant.
                </div>
                {appIdError && <div className="mt-1 text-xs text-danger">{appIdError}</div>}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center gap-2 font-medium">
                <FileCode2 className="h-4 w-4 text-primary" />
                Modifications prévues
              </div>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {analysis.changes.map((change) => (
                  <li key={change} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                    {change}
                  </li>
                ))}
              </ul>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm">
              <Checkbox
                checked={identifierConfirmed}
                onCheckedChange={(checked) => setIdentifierConfirmed(checked === true)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">J’ai vérifié l’identifiant Android.</span>
                <span className="mt-0.5 block text-muted-foreground">
                  Pour une application déjà créée dans Google Play, il doit être strictement
                  identique à celui attendu par la Play Console.
                </span>
              </span>
            </label>
          </div>
        )}

        {runner && (
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
                <div className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {translated.explanation}
                </div>
              </div>
            )}
            {snap.status === "cancelled" && (
              <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                La préparation Android a été interrompue.
              </div>
            )}
            {recoveryMessage && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                {recoveryMessage}
              </div>
            )}
            <LogConsole logs={snap.logs} mode={settings.mode} />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          {running ? (
            <Button variant="outline" onClick={() => runner?.cancel()}>
              <X className="h-4 w-4" />
              Annuler
            </Button>
          ) : runner ? (
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          ) : analysis?.status === "preparable" ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={() => void start()} disabled={!canStart}>
                <ShieldCheck className="h-4 w-4" />
                Préparer Android
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
