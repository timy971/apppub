import type {
  LogLevel,
  OperationKind,
  OperationSnapshot,
  OperationStep,
  StepStatus,
} from "./types";

/**
 * OperationRunner — moteur générique pour toute opération longue.
 *
 * Conçu comme une petite machine à états observable : le UI Build Center
 * s'y abonne pour redessiner l'écran à chaque évènement (log, étape,
 * fin). Aucun couplage à Android : la même primitive servira demain
 * pour la publication ou l'upload TestFlight.
 */

type Listener = (snap: OperationSnapshot) => void;

export interface OperationController {
  signal: AbortSignal;
  setStep(id: string, status: StepStatus, detail?: string): void;
  log(level: LogLevel, message: string, stepId?: string): void;
}

export interface OperationDef {
  id: string;
  kind: OperationKind;
  title: string;
  steps: Array<Pick<OperationStep, "id" | "title" | "description">>;
  execute: (ctrl: OperationController) => Promise<unknown>;
}

const MAX_LOGS = 5000;

export class OperationRunner {
  private snap: OperationSnapshot;
  private listeners = new Set<Listener>();
  private abort = new AbortController();
  private logSeq = 0;
  private rafPending = false;

  constructor(private def: OperationDef) {
    this.snap = {
      id: def.id,
      kind: def.kind,
      title: def.title,
      status: "idle",
      steps: def.steps.map((s) => ({ ...s, status: "pending" as StepStatus })),
      currentStepIndex: 0,
      logs: [],
    };
  }

  get snapshot(): OperationSnapshot {
    return this.snap;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    l(this.snap);
    return () => {
      this.listeners.delete(l);
    };
  }

  /**
   * Coalesce les émissions de logs à ~60Hz pour rester fluide même
   * face à un stream Gradle qui crache des centaines de lignes/s.
   */
  private scheduleEmit() {
    if (this.rafPending) return;
    this.rafPending = true;
    const fn = () => {
      this.rafPending = false;
      this.emit();
    };
    if (typeof requestAnimationFrame !== "undefined") requestAnimationFrame(fn);
    else setTimeout(fn, 16);
  }

  private emit() {
    // Nouvelle référence pour déclencher un re-render React.
    this.snap = {
      ...this.snap,
      steps: [...this.snap.steps],
      logs: this.snap.logs,
    };
    for (const l of this.listeners) l(this.snap);
  }

  cancel() {
    if (this.snap.status !== "running") return;
    this.abort.abort();
    // On marque immédiatement l'étape courante comme annulée pour un
    // retour visuel instantané ; le vrai passage en « cancelled » se
    // fera lorsque execute() rejettera.
    const cur = this.snap.steps[this.snap.currentStepIndex];
    if (cur && cur.status === "running") {
      cur.status = "skipped";
      cur.detail = "Annulée";
      cur.endedAt = performance.now();
    }
    this.emit();
  }

  private controller(): OperationController {
    return {
      signal: this.abort.signal,
      setStep: (id, status, detail) => {
        const steps = this.snap.steps;
        const idx = steps.findIndex((s) => s.id === id);
        if (idx < 0) return;
        const now = performance.now();
        const prev = steps[idx];
        const startedAt = prev.startedAt ?? (status === "running" ? now : undefined);
        const endedAt =
          status === "success" || status === "warning" || status === "error" || status === "skipped"
            ? now
            : prev.endedAt;
        steps[idx] = { ...prev, status, detail, startedAt, endedAt };
        if (status === "running") this.snap.currentStepIndex = idx;
        this.emit();
      },
      log: (level, message, stepId) => {
        const logs = this.snap.logs;
        logs.push({
          id: ++this.logSeq,
          level,
          message,
          at: performance.now(),
          stepId,
        });
        if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
        this.emit();
      },
    };
  }

  async run(): Promise<OperationSnapshot> {
    if (this.snap.status === "running") return this.snap;
    this.snap.status = "running";
    this.snap.startedAt = performance.now();
    this.emit();
    try {
      const result = await this.def.execute(this.controller());
      if (this.abort.signal.aborted) {
        this.snap.status = "cancelled";
      } else {
        this.snap.status = "success";
        this.snap.result = result;
      }
    } catch (e) {
      const aborted =
        this.abort.signal.aborted ||
        (e instanceof Error && (e.name === "AbortError" || /aborted/i.test(e.message)));
      if (aborted) {
        this.snap.status = "cancelled";
      } else {
        this.snap.status = "error";
        this.snap.error = e;
        const cur = this.snap.steps[this.snap.currentStepIndex];
        if (cur && cur.status === "running") {
          cur.status = "error";
          cur.endedAt = performance.now();
        }
      }
    }
    this.snap.endedAt = performance.now();
    this.emit();
    return this.snap;
  }
}
