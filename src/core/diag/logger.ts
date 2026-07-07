/**
 * Diagnostic renderer — logs horodatés côté React, transmis au process
 * Main via IPC afin d'être agrégés dans le fichier `diagnostic.log`.
 *
 * Zéro logique métier : seulement de l'observation.
 *  - `diag(level, message, ctx?)` : trace ponctuelle.
 *  - `diagOp(name, fn)` : marque une opération avec durée + watchdog.
 *  - `openDiagnosticLog()` / `diagnosticLogPath()` : accès au fichier.
 *
 * Un watchdog émet un log `watchdog` toutes les 2 s tant qu'une opération
 * démarrée via `diagOp` n'est pas résolue au bout de plus de 2 s.
 */

type DiagEntry = {
  level: string;
  message: string;
  opId?: string;
  durationMs?: number;
  ctx?: unknown;
  error?: string;
};

interface DiagBridge {
  log?: (e: DiagEntry & { ts?: string; source?: string }) => void;
  openLog?: () => Promise<string>;
  revealLog?: () => Promise<string>;
  getLogPath?: () => Promise<string>;
}

function getBridge(): DiagBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { appPublisher?: { diag?: DiagBridge } };
  return w.appPublisher?.diag;
}

const pending = new Map<string, { name: string; started: number }>();
let seq = 0;

function nextOpId(): string {
  return `r${++seq}`;
}

export function diag(level: string, message: string, ctx?: unknown): void {
  const entry: DiagEntry = { level, message };
  if (ctx !== undefined) entry.ctx = ctx;
  try {
    // eslint-disable-next-line no-console
    console.log(`[diag ${level}] ${message}`, ctx ?? "");
  } catch {
    /* noop */
  }
  const b = getBridge();
  if (b?.log) {
    try {
      b.log({ ...entry, ts: new Date().toISOString(), source: "renderer" });
    } catch {
      /* noop */
    }
  }
}

export function diagOp<T>(name: string, run: () => Promise<T> | T): Promise<T> {
  const opId = nextOpId();
  const started = Date.now();
  pending.set(opId, { name, started });
  diag("op:start", name, { opId });
  return Promise.resolve()
    .then(run)
    .then(
      (v) => {
        pending.delete(opId);
        diag("op:end", name, { opId, durationMs: Date.now() - started });
        return v;
      },
      (e) => {
        pending.delete(opId);
        diag("op:fail", name, {
          opId,
          durationMs: Date.now() - started,
          error: String((e as Error)?.message ?? e),
        });
        throw e;
      },
    );
}

export function openDiagnosticLog(): Promise<string> | void {
  const b = getBridge();
  if (b?.openLog) return b.openLog();
}

export function diagnosticLogPath(): Promise<string> | undefined {
  const b = getBridge();
  return b?.getLogPath?.();
}

/* Watchdog renderer : réémet un log toutes les 2 s pour chaque opération
 * démarrée via diagOp et non résolue depuis > 2 s. */
if (typeof window !== "undefined") {
  const iv = window.setInterval(() => {
    const now = Date.now();
    for (const [opId, { name, started }] of pending) {
      const age = now - started;
      if (age > 2000) {
        diag(
          "watchdog",
          `renderer op '${name}' bloquée depuis ${Math.round(age / 1000)}s`,
          { opId },
        );
      }
    }
  }, 2000);
  window.addEventListener("beforeunload", () => window.clearInterval(iv));
}
