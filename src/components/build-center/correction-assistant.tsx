import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { AndroidCorrectionService, manualCorrections } from "@/core/aab/corrections";
import type { AabValidationReport, AndroidCorrectionPlan, Project } from "@/core/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  project: Project;
  report: AabValidationReport;
  onApplied: () => void;
}

export function AndroidCorrectionAssistant({ project, report, onApplied }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [plan, setPlan] = useState<AndroidCorrectionPlan | null>(null);
  const [error, setError] = useState<string>();
  const manual = useMemo(() => manualCorrections(report), [report]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    void AndroidCorrectionService.preview(project, report)
      .then((value) => {
        if (active) setPlan(value);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, project, report]);

  async function apply() {
    if (!plan?.canApply) return;
    setApplying(true);
    setError(undefined);
    try {
      const result = await AndroidCorrectionService.apply(project, plan);
      if (!result.applied) return;
      toast.success("Corrections appliquées et sauvegardées", {
        description: "Relancez le build pour produire puis contrôler un nouvel AAB.",
      });
      setOpen(false);
      onApplied();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setApplying(false);
    }
  }

  if (report.issues.length === 0) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Wrench className="h-4 w-4" />
        Assistant de correction
      </Button>
      <Dialog open={open} onOpenChange={(next) => !applying && setOpen(next)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Corriger le prochain build Android</DialogTitle>
            <DialogDescription>
              AppPublisher ne modifie que les valeurs prouvées par le rapport. Le fichier AAB déjà
              construit reste inchangé.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyse des fichiers du projet…
            </div>
          ) : (
            <div className="space-y-4">
              {plan?.actions.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Corrections automatiques</h3>
                  <div className="space-y-2">
                    {plan.actions.map((action) => (
                      <div key={action.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center gap-2 font-medium">
                          <CheckCircle2 className="h-4 w-4 text-success" /> {action.title}
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {action.file}
                        </div>
                        <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                          <div className="rounded bg-muted px-2 py-1 break-all">
                            Avant : {action.before}
                          </div>
                          <div className="rounded bg-primary/5 px-2 py-1 break-all">
                            Après : {action.after}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {plan?.sensitive && (
                <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
                  <div>
                    <div className="font-medium">Identité Google Play sensible</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Le package sera confirmé une seconde fois dans une fenêtre native. Une
                      sauvegarde complète des fichiers concernés sera créée juste avant l’écriture.
                    </p>
                  </div>
                </div>
              )}

              {plan?.blocked.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Corrections bloquées</h3>
                  {plan.blocked.map((detail) => (
                    <div
                      key={detail}
                      className="mb-2 flex gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm"
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" /> {detail}
                    </div>
                  ))}
                </section>
              ) : null}

              {manual.length ? (
                <section>
                  <h3 className="mb-2 text-sm font-semibold">
                    Actions qui restent sous votre contrôle
                  </h3>
                  <div className="space-y-2">
                    {manual.map((item) => (
                      <div key={item.issueId} className="rounded-lg border p-3 text-sm">
                        <div className="font-medium">{item.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {!plan && manual.length === 0 && (
                <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                  Ce rapport ne contient aucune correction que l’assistant puisse appliquer sans
                  supposer la configuration du projet.
                </p>
              )}

              {plan &&
                plan.actions.length === 0 &&
                plan.blocked.length === 0 &&
                manual.length === 0 && (
                  <p className="rounded-lg border p-3 text-sm text-muted-foreground">
                    Les fichiers source contiennent déjà les valeurs attendues. L’AAB contrôlé est
                    probablement ancien : fermez cet assistant et relancez simplement le build.
                  </p>
                )}

              {error && (
                <div className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                  {error}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={applying}>
              Fermer
            </Button>
            <Button onClick={apply} disabled={!plan?.canApply || loading || applying}>
              {applying && <Loader2 className="h-4 w-4 animate-spin" />}
              Sauvegarder et appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
